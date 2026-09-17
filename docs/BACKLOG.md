# Backlog

Offene Punkte, jüngster Stand zuerst. Kurz gehalten: was, warum, und wie dringend.
Ältere Abschnitte bleiben stehen, solange etwas darin offen ist.

## Offen für den 19.09.2026 — in dieser Reihenfolge

### Sonnys Entscheidungen, ohne die es nicht weitergeht

1. **Die vier öffentlichen Texte, bevor Phase 5 auf `main` darf.** `app/datenschutz/page.tsx` §8
   sagt wörtlich *„There is no sharing feature today: no other user can be granted access to your
   project."* Dazu `components/TrustBeforeUpload.tsx` („Zugriff nur für das Konto" — **vor** dem
   Hochladen, also genau dort, wo Vertrauen gefasst wird), `SECURITY.md` (kennt nur einen Lesepfad)
   und `docs/DATA-RETENTION.md` (schweigt zur Aufbewahrung der eingeladenen Adresse).
   `tests/trust-card-guard.spec.ts:380` heißt *„it promises no sharing, because there is none to
   promise"* und wird rot — er hat recht. **Phase 5 liegt fertig auf `dev` und wartet allein
   darauf.** Entwurf kann ich machen; die Datenschutzerklärung und `SECURITY.md` sind rechtlich
   relevant und gehen nicht ohne Sonnys Lesen raus.
2. **`firestore.rules` ausrollen** (`npm run deploy:rules`), **vor** dem App-Release — so verlangt
   es 5.4 ausdrücklich. Die Änderung liegt fertig und ist an neun Angriffsfällen geprüft: hinzu
   kommt genau ein Lesezugriff, es fällt nichts weg, kein Feld wird client-schreibbar, kein `get()`.
3. **Die Umfrage-Migration.** Der Fehler ist behoben, neue Antworten kommen an. Alles seit dem
   31.08. liegt weiter unter dem wörtlichen Feldnamen und ist unsichtbar. Die Falle ist
   dokumentiert: `update({'answers.ran': FieldValue.delete()})` löscht genau die eben gerettete
   Antwort. Erst Export als Backup, dann Trockenlauf, dann Migration.
4. **Die Schlüsselrotation** — jetzt gefahrlos, weil der Schlüsselbund auf `main` ist. Der alte
   öffentliche Schlüssel wandert in `AUDIT_SIGNING_PUBLIC_KEYS_RETIRED`.
5. **„Admin" in Roadmapzeile 5.4 streichen?** Die Zeile sagt „Besitzer, Admin oder Einladung", ist
   vom 15.09. und widerspricht Sonnys Entzug des Operator-Lesens vom 16.09. Strang C2 hat die
   spätere Entscheidung genommen und den Widerspruch gemeldet.
6. **Obergrenze für gleichzeitige Einladungen je Projekt?** Das Konzept schlägt drei vor.
7. **PDF: eigener Schreiber oder Bibliothek?** 4.4 hat einen kleinen, lesbaren gebaut (mit `pypdf`
   gegengeprüft, 11 Seiten), weil eine Abhängigkeit rückfragepflichtig war. Alternative `pdf-lib`
   (MIT, ~1,5 MB) — der Austausch beträfe nur `lib/brief/pdf-writer.ts`.

### Sicherheit, in der Reihenfolge des Schadens

8. **Die WIF-Provider-Bedingung verengen** (`gcloud`, braucht Sonny). Die Erlaubnis steht seit heute
   allein im Deploy-Job; die Bedingung ist weiter nur `attribute.repository`, ohne Ref und ohne
   Workflow, für ein Dienstkonto mit `roles/editor`, `run.admin`, `storage.admin`. **Das ist die
   zweite Hälfte des dringendsten Fundes von heute.**
9. **`clean-core-dev` hält Produktionsgeheimnisse** und ist `--allow-unauthenticated`: derselbe
   `AUDIT_SIGNING_KEY`, der Produktions-Beweismappen signiert, dazu `S4_ENCRYPTION_KEY`,
   `RESEND_API_KEY`, `PILOT_APPROVAL_SECRET`, `MFA_BACKUP_CODE_PEPPER`. Senken: getrennte
   Dev-Geheimnisse und GitHub Environments (M).
10. **Kontosperre entzieht den direkten Firestore-Zugriff nicht** (offen aus 0.14). Der billige Weg:
    Custom Claim `suspended` plus `revokeRefreshTokens`, dann fragt die Regel das Token statt ein
    Dokument zu lesen. **Achtung:** muss die *ganze* Lesebedingung umklammern, nicht nur den
    Besitzerzweig — sonst liest eine gesperrte eingeladene Person weiter (Befund von C2).
11. **SEC-2026-077 nicht nach Empfehlung beheben.** Erst ein Redaktor für die Fundstelle, dann die
    `AIzaSy`-Ausnahme. Umgekehrt landet ein echter Schlüssel im signierten Pack.

### Arbeit, die keine Entscheidung braucht

12. **Die 97 hohen Befunde der Release-Vollprüfung** triagieren — nach dem Muster von heute, mit der
    Faustregel „bei `test-weakening` zuerst die Nettobilanz per `git show --stat`".
13. **Die UX-Befunde**: 58 aus dem Release, davon 54 übertragen, 61 offen im Register. Vier sind neu.
14. **0.2 zu Ende:** Facts-Service und Copy-CI stehen weiter aus — die letzten beiden Posten, die
    Phase 0 offenhalten.
15. **0.18, der lohnendste Rest:** eine Befundmarke für die Typabhängigkeit (R29). Dann wird
    CC-045 · befunde von „nicht vergleichbar" zu einem echten Vergleich statt zu einem Schweigen.
16. **Das Auto-Heal ist wirkungslos** (Befund aus 0.17, in der Roadmap notiert). Der wahrscheinliche
    Weg ist ein quittungsloser Kandidatenmodus, der ausführt, aber weder Quittung noch Verdikte
    schreibt — damit „ausprobiert" nie wie „belegt" aussieht.
17. **Zwei Flaker, die einen eigenen Fix verdienen** (beide am unveränderten Baum reproduziert):
    `process-editor.spec.ts › editing leaves the reconstructed Ist exactly as it was` liest die
    Traceability-Zeile vor und nach dem Editieren, und der `ensureQuote`-POST landet je nach Timing
    dazwischen — die `CLAUDE.md`-Falle „ein Test, der auf ein Fenster wartet".
    `preservation-register.spec.ts › each stage opens on its reference case` fällt nur im Stapel.
18. **`tests/verdict-honesty-guard.spec.ts:27` ist lokal rot, in CI grün** — der dynamische
    `import('../lib/test-verdicts')` wird von einer Behelfskonfiguration unter `tmp/` nicht
    transpiliert, weil die Datei außerhalb von `testDir` liegt. Kein Befund, aber es hat heute drei
    Strängen Zeit gekostet. Entweder die Behelfskonfiguration reparieren oder den Hinweis ins
    Briefing.
19. **Der Referenzkorpus hat weiter keine unabhängige Gegenzeichnung.** Das Fallbuch sagt es selbst:
    *„kein Fall ist von einem SAP-Architekten gegengezeichnet."* Joule for Consultants war der
    naheliegende Gegenprüfer und ist verworfen (direkte SAP-Lizenzierung nötig). Wenn jemand mit
    SAP-Hintergrund verfügbar ist, sind die **zwölf Fälle mit Abweichung** eine Stunde Arbeit und
    mehr wert als jedes weitere Modell.

### Hygiene, bevor die nächste Welle startet

20. **Emulator und Dev-Server neu starten**, bevor mehr als vier Agenten laufen. Der Emulator stand
    heute abend bei 6,3 GB und 20.000 CPU-Sekunden; seine Fehlschläge sehen wie Regressionen aus.
21. **Höchstens sieben Agenten**, und lieber vier. Jenseits davon wird die Maschine zum Engpass —
    Lint ging von zwei auf vierzig Minuten und starb einmal am Heap.
22. **Nach jedem Merge mit neuer Abhängigkeit installieren** — und nie `npm ci` im Hauptcheckout,
    solange Agenten über Junctions darauf zeigen.

---

**Feierabend 18.09.2026 — v2.13.0 ist auf `main` (`a7c9e71`).** Der Tag hatte drei Themen:
Phase 2 zu Ende bringen, Phase 3 ganz bauen, und die Vollprüfung von `a19945ef01dc` abarbeiten
statt sie weiter zu triagieren. Vierzehn Stränge liefen, meist vier bis sieben gleichzeitig.

**Gebaut: elf Roadmap-Schritte.** 2.4 Fachliche Benennung · 2.5 BPMN-Ansicht · 2.6 BPMN-Export ·
2.7 Erster Blick · 2.9 Große Prozesse navigieren — **Phase 2 ist damit vollständig**. 3.1 Editor ·
3.2 Revisionen · 3.3 Prüfhinweise · 3.5 Zustände je Element und Regel · 3.6 Ist und Soll —
**Phase 3 ist vollständig**. Dazu 4.4 Kurzbrief und 5.1–5.5 Teilen, beide auf `dev` und noch nicht
auf `main` (Grund unten).

**Die Engine: 24 Korpus-Defekte auf einen.** Drei Familien geschlossen. Die dreizehn
Engine-Defekte der Vollprüfung hatten *eine* Wurzel — jeder Detektor brachte sein eigenes halbes
Maskieren mit, keiner kannte das Stringtemplate, zwei kannten auch Kommentare nicht. Die Regel
steht jetzt einmal in `lib/abap/statement-reader.ts`, sechs Detektoren lesen sie, fünf eigene
Literalkopien sind gelöscht. Die beiden schwersten Befunde *löschten* etwas statt zu erfinden:
eine auskommentierte Deklaration ließ den kritischen Schreibzugriff auf VBAK restlos
verschwinden, und ein Wort in einem Stringtemplate machte aus einem echten Schreibzugriff eine
interne Tabellenoperation.

**Der eine übrige Defekt ist keiner.** CC-050 · level: das A der Engine stammt aus dem
freigegebenen `I_CUSTOMER` und ist als Objektnote richtig; das B des Falls ist ein **Artefaktlevel**
nach R03. Was fehlt, ist die Sprachversion — und ein Level je Artefakt verweigert
`/method/levels` öffentlich. Produktentscheidung, kein Bugfix.

**Die Vollprüfung ist abgearbeitet, nicht nur gelesen.** Von 504 Befunden: alle 30 kritischen und
alle 94 hohen entschieden; 46 behoben (11 Engine, 14 Sicherheit, 10 ehrliche Aussagen und Umfrage,
11 Vertrauenskette). Das Release v2.13.0 brachte eine zweite Vollprüfung (25 kritisch, 97 hoch) und
ein Sicherheitsaudit (3 kritisch, 1 hoch) — die kritischen beider sind entschieden, die 97 hohen
der zweiten stehen noch offen.

**Zwei echte Löcher zu.** Zip-Slip in der Auslieferung: modellerzeugte Pfade gingen ungeprüft ins
Archiv und hätten beim Entpacken Dateien **auf dem Rechner des Kunden** überschrieben; die Prüfung
lehnt jetzt ab statt zu reparieren. SSRF in der Egress-Allowlist: `h.endsWith(s)` statt
`h.endsWith('.' + s)` — damit passte `evil-sap.com` auf `sap.com`. Dazu SEC-2026-025 vom Vormittag,
ein Dateileseloch in der Testlauf-Sandbox.

**Und der Fund, der in keinem Prüfbericht stand.** `id-token: write` auf Workflow-Ebene plus
`npm ci --foreground-scripts` plus ein Workload-Identity-Provider ohne Ref-Bedingung für ein
Dienstkonto mit `roles/editor`: ein bösartiges npm-Paket wäre Editor im GCP-Projekt geworden, ohne
Menschen, ohne Fork, ohne Pull Request — und `usage-report.yml` läuft freitags von selbst. Der
Prüfer hatte vierzehn Workflow-Befunde gemeldet und in keinem davon diesen Weg benannt; er
unterstellte durchweg einen Collaborator, den das Repository nicht hat (einer, null Forks). Die
Erlaubnis steht jetzt allein im Deploy-Job; die Provider-Bedingung fehlt noch und braucht `gcloud`.

**Ehrlichkeit nach außen.** Die How-to-Seite und die Landingpage beschreiben das Produkt, das es
gibt: sechs Screenshots vom Juli gelöscht statt übermalt, sieben Phasen statt sechs, der Chatbot
liest dieselbe Quelle wie die Seite. Jede Antwort der laufenden Zufriedenheitsumfrage war
unsichtbar — ein Punkt im Firestore-Schlüssel ist kein Feldpfad, sondern ein Zeichen im Feldnamen.
Fünf Stellen, an denen das Produkt mehr behauptete als es tut, sind gegangen statt umformuliert.

**Was die Prüfer über sich selbst verraten haben.** 44 Widerlegungen heute, und sie fallen in vier
Muster: zehnmal „eine Zusicherung wurde entfernt", während der Commit sie mehrzeilig und schärfer
ersetzt hatte (Nettobilanz prüfen, nicht den Hunk lesen) · viermal Zeilen, die es am geprüften
Commit nicht gab · dreimal ein Namensmuster ohne Substanz (`_KEY` plus Zeichenkette) · zweimal der
Kommentar eines Guards gelesen als Beschreibung dessen, was der Guard verhindert. **Zweimal war der
Rat des Prüfers gefährlicher als sein Befund** — beim Vorschlag, die `AIzaSy`-Ausnahme zu entfernen
(ein echter Schlüssel wäre im signierten Pack gelandet), und bei den vierzehn Workflow-Befunden, die
an einem erfundenen Angreifer hingen.

**Meine eigenen Fehler, damit sie nicht wiederkommen.** (1) Den Rückgabewert einer Pipeline als
Testergebnis gelesen — `tail` lieferte exit 0, Playwright hatte zwanzig Fehlschläge. Nur die Zeile
`PASS (n) FAIL (m)` zählt. (2) `npm ci` im Hauptcheckout gefahren, während sieben Agenten über
Junctions auf dasselbe `node_modules` zeigten; es löschte und scheiterte dann an einer Sperre. Das
verbietet mein eigenes Briefing den Agenten. (3) Nach einem Merge mit neuer Abhängigkeit nicht
installiert — `bpmnlint` fehlte, und stundenlange lokale Rotfärbungen kamen daher. (4) Eine Ref
beim Rendern geleert (`react-hooks/refs`) und damit den Build auf `dev` rot gemacht; Strang Y hat es
gemeldet, obwohl die Datei für ihn tabu war. (5) Empfohlen, CC-050 in der Grundlinie umzubuchen —
**die Korpus-Ratsche hat es gefangen**, mit einer Zusicherung, die jemand geschrieben hat, bevor es
etwas zu beschönigen gab: *„kein einziger Engine-Defekt über 68 Fälle — das wäre der Moment, den
Vergleich zu misstrauen, nicht die Engine zu loben."*

**Was die Maschine über Parallelität gelehrt hat.** Sieben Agenten sind die Obergrenze dieses
Rechners, nicht der Arbeit: ein Lint-Lauf wuchs von zwei auf vierzig Minuten und starb einmal bei
6 GB Heap; der Firestore-Emulator stand nach einem Tag bei 6,3 GB und 20.000 CPU-Sekunden und
musste neu gestartet werden, was einen Strang zwei Stunden kostete. **Ein wandernder Fehlschlag in
einem großen Spec-Satz ist ein Infrastrukturzeichen, kein Befund** — aber nur, wenn man ihn einzeln
nachprüft.

**Und die Lehre über Nähte.** Ich habe 3.1 und 3.2 parallel vergeben, ohne zu benennen, wem die
Stelle dazwischen gehört. Beide Stränge lieferten sauber, und dazwischen lag nichts: der Editor
speicherte nirgendwohin. Bei 3.5/3.6 und bei 5.1–5.3/5.4–5.5 habe ich den Datenvertrag deshalb
**vorher** festgelegt und mich selbst als Besitzer der Naht benannt — beide Male hielt sie ohne eine
Zeile Anpassung.

**Feierabend 17.09.2026 — v2.12.0 ist auf `main` (`e3817ce`).** Der Tag hatte drei Themen: zwei
Sicherheitslöcher, den Referenzkorpus, und den Beginn von Phase 2. Sechs Stränge liefen
parallel, jeder in eigener Worktree.

**Zwei echte Löcher, beide vor dem Fix nachgestellt.** Eine signierte Beweismappe war
fälschbar: der Dateiname durfte das Trennzeichen der kanonischen Form tragen, also ließen
sich zwei signierte Beweisdateien zu einer zusammenziehen — gleiche Bytes, gültige Signatur,
eine Beweisdatei weniger, und `verify-pack` sagte „Verified." mit Exit 0. Dazu prüfte die
Attestation nur die *Existenz* der Datei, nicht ihren Inhalt, und Ausgabedatum wie
Formatversion waren gar nicht gebunden. Und: ein Administrator ohne eingerichteten zweiten
Faktor konnte aus einem gewöhnlichen ID-Token jedes fremde Projekt samt signierter Runs
löschen, weil `decoded.admin === true` als Eigentümerschaft galt und der MFA-Gate jedes
Token durchlässt, wenn das Konto keinen Faktor aktiviert hat. Beide behoben; alte Mappen
verifizieren byte-identisch weiter.

**Der Referenzkorpus liegt im Repository und prüft die Engine** (Schritt 2.10). 68 Fälle als
Fallbuch unter `docs/korpus/`, 209 generierte Dateien unter `tests/korpus/cases/`, eine
Ratsche in `tests/korpus-engine.spec.ts`. Die Grundlinie ist die eigentliche Neuigkeit: 340
Fall-und-Klassen, 178 übereinstimmend, **24 Engine-Defekte**, 4 Fälle, in denen der Korpus
selbst unrecht hat, 134 Aussageklassen, die die Engine noch nicht produziert. Die drei
Defektfamilien stehen als Schritt **2.11** in der Roadmap — neun Fälle bekommen D statt C,
weil die Note Zugriffsart und Nachfolger ignoriert; fünf urteilen milder als erlaubt
(darunter A für `WITH PRIVILEGED ACCESS`); neun sehen eine Abhängigkeit gar nicht oder die
falsche. Der Weg dahin: vier Modelle haben v1 einstimmig abgelehnt, ein Gegenreview hat 35
Regeln beurteilt (sechs hielten nicht), fünf Autoren haben v2.1 daraus gebaut, und ein
Durchgang durch öffentliche Repositories hat für neun Fälle belegt, dass ihr Konstrukt real
vorkommt — ohne einen einzigen Zeiger im Repository, weil vierzehn der fünfzehn Quellen keine
Lizenz tragen und die tragenden nach allen Indizien unautorisiert hochgeladene
Arbeitgeberbestände sind.

**Phase 2 ist sichtbar begonnen:** 2.3 baut das Prozessskelett deterministisch aus Code
(`Z_ORDER_INTEGRITY_CHECK` bekommt 0 Knoten und eine Notiz statt eines erfundenen Starts),
2.8 findet 140 versteckte Geschäftsregeln mit Anker. Beide tragen die Korpusregeln.

**Neun UX-Befunde, vier Versprechen ersatzlos entfernt** (Schritt 0.2): der
Remediation-Schalter schaltete Text statt Code, die „Transformation Insights" waren für jedes
Projekt dieselben, das SAP-Build-Badge versprach einen Export ohne Gegenstück, und das Forum
meldete Erfolg, nachdem es in `useState` geschrieben hatte.

**Die vier Schleifen nach dem Release:** Produktion liefert v2.12.0 (`e3817ce`, 06:38Z).
Das UX-Review nennt den Schnitt „ehrlicher — Schein-Forum, falsche TCO-Versprechen und
doppelte Quota-Regeln sind weg"; seine zwölf offenen Befunde sind triagiert, sechs
angenommen, sechs widerlegt (fünf davon Dubletten, dreimal dieselbe Token-Liste, die in
`DESIGN.md` §1.2/§1.5 beschlossene Skala). Zwei davon sind es wert, morgen zuerst angefasst
zu werden: **UX-107** — ein Knopf auf dem Admin-Pfad sagt „Sign In as Admin" und ruft
`auth.signOut()` (selbst nachgesehen, steht wörtlich so da, S-Aufwand) — und **UX-102**, die
How-to-Seite verspricht sechs Phasen, während das Produkt sieben hat; das liest ein Architekt
*vor* dem ersten Lauf. Security-Audit und Vollprüfung von v2.12.0 liefen beim Herunterfahren
noch; ihre Befunde sind der erste Griff am nächsten Tag.

### Was offen ist und warum

1. **Der QA-Agent liest nicht mehr — und meldet trotzdem grün.** Das ist der dringendste
   Punkt. Ein Review über `5f84bb2` und eines über `9edb37f` machten **null Modellaufrufe**
   und gaben `go_with_notes` zurück; ein grünes Häkchen über ungelesenem Code ist schlimmer
   als ein rotes. Zwei Ursachen, eine behoben: das Korpus-Bündel hatte das Delta auf 3,3 MB
   getrieben (`tests/korpus/cases/**` steht jetzt in der Ausschlussliste, Ratsche und
   Konverter bleiben geprüft) — aber **262 mitgeführte Befunde mit 288.335 Zeichen** gehen in
   jede Anfrage, bevor eine Datei dazukommt, und sprengen das Budget allein. Der Checkpoint
   hängt seit `a19945e`. Zwei Wege: den Bestand triagieren (die 222 Medium sind großenteils
   Design-System-Galerie und Arbeitsraum, also Roadmap-Arbeit) oder nur die *neuen* Befunde
   mitgeben. Beides ändert die Agentenmaschinerie.
2. **Entscheidungen 7 bis 13 in ROADMAP §9** — Secret-Rotation, CSP ohne `unsafe-inline`,
   S/4-Credential-Proxy, das fehlerhafte ABAP im ausgelieferten 1000-Zeilen-Beispiel, die
   nachsichtige Dezimalregel, Kommentarzeilen in der Komplexität, das Review-Budget.
3. **Bleibt das Forum?** Die Schreibhälfte ist weg, die Ankündigungen sind lesbar und als
   read-only benannt. Ob das Board als Ganzes bleibt, ist nicht entschieden.
4. **Schritt 0.2 ist nicht fertig:** Facts-Service und Copy-CI stehen aus, und §14 plant rund
   dreißig QA-Befunde in denselben Schritt.
5. **Die 80 hohen Befunde der Vollprüfung** von v2.11.1 sind die nächste Triage; die 30
   kritischen sind alle entschieden.
6. **Der Korpus braucht noch:** jede `source.abap` durch abaplint und die metamorphen
   Eigenschaften ziehen (dann tragen die Fälle diese Stufen), die vier Fälle korrigieren, in
   denen er sich selbst widerspricht, und das maschinenlesbare Fallbündel mit Kontexthash.
   `architekt` bleibt für jeden Fall 0 — das ist die Einschränkung, mit der er lebt.

**Stand 16.09.2026, spät — v2.11.1 ist um 21:53Z auf `main` gegangen (`a19945e`, 90 Commits seit
v2.11.0, Fast-Forward, CI grün, Regeln um 20:25Z vorher ausgerollt). Phase 0 und Phase 1 sind
abgeschlossen, Phase 2 hat begonnen.** Phase 0 zu Ende gebracht mit 0.5 und 0.6 (Eingabemanifest im
signierten Lauf, konservative Ungültigkeit statt Frischeheuristik), 0.9/0.10/0.11 (die acht Beispiele je
einmal frei, Demo unter `/demo/{stage}` aus einem echten Engine-Lauf, Vertrauenskarte mit Belegregister),
0.3 (Regelversion gemessen, fünf TCO-Versprechen weg, Abgrenzung zu SAPs Kennzahlen), 0.7 (Freigabefelder
nur noch über `POST /api/projects/{id}/commands`, Regel-Deploy mit Datensatz), 0.17 (die fünf offenen
Punkte nachgezogen) und 0.18 (Engine-Korrekturen). Phase 1 vollständig: 1.1 Erhaltungsregister, 1.2
Zero-LLM-Pfad, 1.4 Arbeitsraum-Schale, 1.5 Gestaltung als Komponenten, 1.6 kein Dark Mode, 1.7 Grün heißt
belegt, 1.8 „My workspace" als List Report — 1.3 war in v2.10.1 vorgezogen. Phase 2 begonnen: 2.1
Verzweigungen, 2.2 Aufrufe, beide deterministisch und mit Zeilenbereich; **2.3 bis 2.9 stehen aus, die
Phase ist nicht fertig.** Dazu das erste vollständige Security-Audit (247 gemeldet, 24 entschieden, die
meisten widerlegt), die UX-Delta-Review (7 entschieden, 2 widerlegt) und rund ein Dutzend QA-Runden.

**Spät am Abend des 16.09. dazugekommen:** der Wettlauf-Test zu 0.6 hält jetzt auch auf dem
Produktionsbuild (`a19945e`, CI grün — die 37-kB-Quelle hält das Fenster offen, der Abtaster stoppt, wenn
die Anfrage endet). Zwei Unabhängigkeitsprüfungen über der Engine, beide als Ratsche im Test: **abaplint als
zweiter Parser** (`tests/abaplint-second-opinion.spec.ts`; neun Abweichungen mit Urteil im Register, „wir
haben recht" ist dort verboten; vier Defekte an Stringtemplate-Literalen in drei Lesern behoben — eines
davon ließ ein `IF lv = |Status: ok|.` aus dem Diagramm verschwinden) und **fünf metamorphe Eigenschaften**
(`tests/abap-metamorphic.spec.ts`, 98 Tests, je Eigenschaft ein Rot-Beweis; `ENDIF. " done` zählte nicht
als Schließer, Komplexität 10 statt 9). Drei weitere Befunde daraus stehen als Entscheidungen 10–12 in
ROADMAP §9 und zwei als Arbeit in Phase 2. **Referenzkorpus:** vier Modelle mit identischer Ausgangslage
sagen einstimmig „nicht freigeben"; Entscheidung Sonny: kein externer Prüfer, v2 mit
Unabhängigkeitsstufen und Negativliste gebaut (ROADMAP §9, Entscheidung 1). Und der QA-Checkpoint hing
seit `44a8715` fest, weil das aufgelaufene Delta nicht in vier Aufrufe passte — 16 Befunde des großen
Deltas mit Beleg widerlegt, der Checkpoint wurde in sechs Scheiben per `workflow_dispatch` auf `a19945e`
nachgezogen, das Budget blieb unangetastet; weitere zwölf Befunde aus den Scheiben widerlegt (drei
„Modellbeteiligung clientgesteuert" — seit `9585a6d` kommt sie aus der Quittung; vier Objekt-`trim`;
Regel-Deploy-Familie; Schalter-Absicht).

**Nach dem `main`-Push (a19945e, 21:53Z) in der Nacht:** Security-Audit v2.11.1 **ohne bestätigten Befund**
(619 Dateien, ein Muster-Treffer im öffentlichen Verifier, im Register erledigt). UX-Review: vier Befunde,
alle bereits entschieden. Vollreview: 30 kritisch / 94 hoch / 373 mittel, INCOMPLETE — sechs bekannt, acht in
der Nacht widerlegt (`vercel.json` und die Survey-Workflows existieren am Commit nicht), rund 17 kritische
Hypothesen zur Audit-Pack-Kanonisierung und zu client-schreibbaren Artefakten in signierten Packs sind
**der erste Block am 17.09.** (ROADMAP §14). Und das Delta-Review von `04b4684` hängt am 52-kB-Diff des
Metamorphie-Specs — Entscheidung 13 in ROADMAP §9.

**`firestore.rules` muss vor dem App-Deploy von Hand ausgerollt werden** (`npm run deploy:rules`) — zweimal
in diesem Release geändert: die Admin-Einsicht in Projekte ist weg, und 0.7 nimmt sechs Felder aus der
client-schreibbaren Allowlist. Eine App auf nicht ausgerollten Regeln bricht genau an diesen Stellen.
Anlass dafür war ein Befund: das erste Nachsehen über die Rules-API zeigte am 16.09. in Produktion das
Ruleset vom 20.08., drei Verschärfungen hinter dem Repository — einen Monat lang, ohne dass irgendetwas
es gemeldet hätte. Ausgerollt um 14:43:04Z nach Sonnys Go, danach auf allen sechs Datenbanken nachgeprüft.
`docs/registers/rules-deployment.json` hält jetzt fest, welcher Text live ist; `npm run rules:check`
vergleicht offline, `npm run rules:verify` fragt die Produktion, `tests/rules-deploy-order.spec.ts` bricht
bei der einen Reihenfolge, die Produktion kaputt macht.

Was nur Sonny entscheiden oder tun kann:
- **Die drei CI-Secrets tauschen?** `S4_ENCRYPTION_KEY`, `MFA_BACKUP_CODE_PEPPER` und
  `PILOT_APPROVAL_SECRET` lagen bis zum 16.09. in jedem Lauf des `validate`-Jobs, also in einem Job, der die
  ganze Testsuite ausführt und den jede Änderung an einem Spec steuern kann (SEC-2026-024). Der Job bekommt
  sie nicht mehr; ob die Werte selbst zu tauschen sind, ist seine Entscheidung.
- **Das Sicherheitsregister hängt hinterher.** SEC-2026-008 (0.7), SEC-2026-014 und SEC-2026-015 sind in
  diesem Release behoben, stehen im versiegelten Register aber weiter auf `eingeplant` — und damit auch in
  `docs/ROADMAP.md` §12, das daraus erzeugt wird. Ein Lauf von `scripts/security/register.mjs decide` zieht
  das nach; eine Statusentscheidung ist keine Dokumentationsarbeit, deshalb steht sie hier.
- **SEC-2026-016 und SEC-2026-018 warten auf ihn:** eine Härtung an einer Stelle, an der eine Verschärfung
  schon einmal die Anmeldung gebrochen hat (braucht einen Test gegen den echten Login), und ein Entwurf, der
  entschlüsselte Zugangsdaten nicht mehr in die Umgebung eines Kindprozesses gibt.
- **0.2 ist nicht abgehakt.** Die Signavio-Aussagen wurden in v2.10.2 zurückgenommen, aber das UX-Register
  plant noch neun Befunde in diesen Schritt ein (UX-026, UX-027, UX-029, UX-037, UX-038, UX-040,
  UX-059, UX-076, UX-084). Entweder gehören sie woandershin, oder Phase 0 hat noch einen Rest.
- **Offen aus 0.17, nicht nachgezogen:** `42a7d6a55d3b` — die Verlusttoleranz der beiden CISO-Aufrufe ist an
  den Bausteinen getestet, nicht am Einstiegspunkt; dafür müsste `audit.mjs` seine Orchestrierung als
  Funktion exportieren, statt beim Import eine Prüfung zu starten. Agenten-Maschinerie, also sein Go.
- Weiter offen aus dem Stand davor: Identity-Platform-Upgrade und der Faktor-Login auf `dev` gegen das echte
  Auth; der überholte Bot-Branch `chore/sync-cloudification-repo`; der QA-Secret-Scanner, der gelöschte
  Zeilen meldet; die Resend-Tracking-Einstellung (3.0.9).

**Stand 16.09.2026, Abend — v2.11.0 steht auf `dev` und wartet auf Sonnys Go.** Vier Schnitt-0-Schritte
gebaut und integriert: 0.13 (Firebase-nativer zweiter Faktor), 0.14 (Konto, Schlüssel, Rechte),
0.15 (Dashboard, Admin, die sieben Stufen), 0.16 (Skripte und Workflows). Letzte Delta-Prüfung
`00f19f7d32a8`: 0 kritisch, 0 hoch, Smoke OK, neue Revision serviert. Offen und in 0.17 eingeplant:
vier Befunde derselben Art — Guards, die Quelltext lesen, wo nur ein Laufzeitnachweis zählt
(6a1e32c0b973, 1738da3d6e64, cca300dfb572, 6f7a14516006).

**Admin-Einsicht in Projekte entfernt (Sonny, 16.09.2026):** „nimm mich als admin raus beim thema projekt
einsichtnahme. das muss streng sein und nur in notfällen von schadcode etc." `firestore.rules` gewährt bei
`projects/{id}` und `projects/{id}/runs/{runId}` keinen Admin-Lesezugriff mehr, und das pauschale Admin-`update`
auf Projekte ist ebenfalls weg — nur noch der Besitzer. Ein Test in `tests/firestore-rules.spec.ts` meldet sich
mit echtem Admin-Claim an und weist Lesen, Run-Lesen und Schreiben nach. Die Datenschutzerklärung sagt es jetzt
ausdrücklich, samt der einen Ausnahme: ein Notfall (glaubwürdige Meldung von Schadcode in einem Upload) ist ein
bewusster serverseitiger Akt über das Admin-SDK, das die Regeln bauartbedingt umgeht — keine offenstehende
Berechtigung, und mit Protokoll.
**Sonny muss die Regeln von Hand deployen** (`npm run deploy:rules`), CI tut das nie. Bis dahin gilt in
Produktion die alte Fassung.
Nebenbefund: `tests/security-compliance.spec.ts` prüfte die GDPR-Löschkaskade, indem es sich als Admin anmeldete
und die Dokumente als Client las — diese Berechtigung gibt es nicht mehr; die Prüfung läuft jetzt serverseitig,
wie bei den ohnehin gesperrten Collections.

**Umfrage eingestellt (Sonny, 16.09.2026):** „kann generell ausbleiben, ist eh vorbei ohne Erfolg." Die
Workflows `survey-send.yml` und `survey-digest.yml` bleiben dauerhaft aus — nicht mehr „bis die Log-Fixes auf
`main` sind", sondern endgültig. Kein weiterer Aufwand in Versand, Digest oder Auswertung. Der Code bleibt
vorerst stehen (Ausbau wäre eine eigene Entscheidung); die Korrekturen aus 0.16 an `send-survey.ts`,
`lib/survey/outbox.ts` und der Umfrageseite sind gebaut und bleiben, weil sie dieselben Mail-Bausteine
betreffen wie der Rest.

Was nur Sonny entscheiden oder tun kann:
- **Security-Agent auf `main` fällt seit drei Läufen aus** (zuletzt 35069919896): 52 Consultant-Calls
  laufen durch, dann antwortet der CISO-Call zweimal nicht mit JSON und die ganze Prüfung ist verloren.
  Vorschlag: Ergebnis auch ohne CISO-Zusammenfassung ausliefern **und** die Synthese in zwei kleinere
  Calls teilen. Beides ist Agenten-Maschinerie, also sein Go.
- **Der QA-Secret-Scanner meldet gelöschte Zeilen** (`scripts/qa/lib/redact.mjs` liest das Delta, also
  auch `-`-Zeilen): eine entfernte Test-Konstante wurde zweimal als kritischer Fund gemeldet. Einzeiler,
  aber ebenfalls Agenten-Maschinerie.
- **Bot-Branch `chore/sync-cloudification-repo` kann gelöscht werden**: gleicher `sourceSha256`, gleiche
  25.467 Einträge, 0 hinzugefügt/entfernt/geändert, und sein `fetchedAt` ist älter als der Stand auf
  `main`. Die 28.000 Diff-Zeilen sind Formatierung aus einer älteren Skriptversion. `push --delete` ist
  mir verweigert.
- **Identity Platform**: nach dem Upgrade in der Firebase-Console `npx tsx scripts/mfa-enable-totp.ts
  --apply`, dann Faktor-Login auf `dev` gegen das echte Auth prüfen, dann `scripts/mfa-reset.ts <mail>
  --apply` vor seiner ersten Anmeldung — danach richtet er den Faktor in den Einstellungen neu ein.

**Stand 16.09.2026 — die Vollprüfung von v2.10.7 abgearbeitet, auf `dev`.** 144 Befunde von GPT-5.6 Sol
(4,91 $), jeder am Code geprüft, Ergebnis in `docs/ROADMAP.md` §14: 130 bestätigt, 11 widerlegt mit Beleg
(`docs/qa/refuted-findings.enc.json`, jetzt 29 Einträge), 2 unklar, 1 nebenbei erledigt. Die Lehre wie gestern:
die widerlegten waren fast alle Komponenten und Funktionen, die nirgends gerendert oder aufgerufen werden —
ein Modell liest die Datei, nicht den Aufrufgraphen.

Heute behoben (jeweils mit Test, der ohne den Fix rot ist): die Testkonto-Erkennung zählt nur noch die
CI-Domain, kein Namenspräfix mehr — `security-user-alice@example.com` war ein Löschkandidat; der
Delta-Sync der Migration überschreibt kein Zieldokument, das nicht beweisbar älter ist; die Survey-Skripte
drucken weder Adressen noch den Digest ins öffentliche Actions-Log, und ein fortgesetzter Versand nennt das
gespeicherte Schlussdatum und zählt Eingeladene je gesendeter Mail; der Offline-Verifier folgt keinem
`signingKeyUrl` aus dem Pack, lehnt Archiv-Einträge ab, die das Manifest nicht nennt, und beendet ein
unsigniertes Pack mit 2 statt 0 — dasselbe für die Web-Verifikation; `vercel.json` (jede Route öffentlich
cachebar, auf Cloud Run ohne Wirkung) ist weg. Die drei übrigen kritischen sind eigene Schritte 0.12–0.13,
die hohen und mittleren füllen 0.14–0.18.

Daneben: der Security-Audit von 33471220d6e9 hatte nach 70 Minuten und 57 erfolgreichen Beraterläufen
keinen Bericht, weil die CISO-Antwort abgeschnitten ankam — `audit.mjs` fragt genau diesen einen Aufruf jetzt
einmal nach (als testbarer Helper `askAgainIfTruncated`). **Versuch 2 scheiterte anders:** 54 von 57
Beraterläufen ok, die CISO-*Antwort* selbst kein gültiges JSON. Ob der CISO Prosa schrieb oder bei
`cisoOutputTokens: 40_000` (inklusive Reasoning, `cisoEffort: 'high'`, bis 300.000 Zeichen Eingabe) mitten im
JSON abgeschnitten wurde, konnte die eine Fehlerzeile nicht sagen — `openrouter.mjs` nennt jetzt bei ungültigem
Inhalt `finish_reason` und die Token-Zahlen (nie den Inhalt). Die Budget-Entscheidung — mehr Ausgabe-Tokens
für den CISO oder Effort `medium` — ist Sonnys: **`medium`** (16.09.2026, `scripts/security/lib/team.mjs`);
der nächste Release-Audit zeigt, ob es reicht. v2.10.7 hat keinen Sicherheitsbericht. `refute.mjs` findet jetzt auch Vollprüfungen (vorher
konnte kein Befund einer Vollprüfung widerlegt werden). Der Bot-Branch `chore/sync-cloudification-repo`
ist überholt — `dev` trägt denselben `sourceSha256` vom 15.09. —, löschen darf nur Sonny. `sync-catalog.yml`
steht seit dem 07.09. rot, weil der PR-Schritt bis zum 14.09. an der Repo-Einstellung scheiterte; seit dem
15.09. öffnet der Job keinen PR mehr, der nächste Montagslauf zeigt es.

**Sonnys Entscheidungen heute:** `CLAUDE.md`, README und jede öffentlich veraltete Datei werden erst mit
3.0 nachgezogen (3.0.8); die Zustellbarkeit der Mails braucht einen eigenen 3.0-Schritt, weil die Mails
trotz korrekter SPF/DKIM/DMARC automatisch im Spam landen (3.0.9). Für 0.12 Variante A: signierte Dateien
nur aus dem Run, die Aussagen des Kontos in einer eigenen, unsignierten und so benannten Datei —
**gebaut am selben Tag** (`07-user-attested.md`, Name im Hash gebunden, Inhalt nicht; beide Verifier
zeigen es; Narrative-Gaps nicht mehr im signierten Run). Damit sind 10 der 11 kritischen Befunde der
Vollprüfung zu, offen bleibt 0.13 (zweiter Faktor vor der Sitzung).

**QA-Runde 2 zu 0.12 (`ca3264f`):** der `validate`-Job war rot, weil zwei Kommentare in
`lib/audit-pack-canonical.ts` ein Versionsliteral trugen (Version-Drift-Guard) — behoben; die
Pipeline-E2E war „flaky" (Design-Seite unter Parallel-Last, allein grün). Bestätigt und behoben: die
Survey-Outbox wird in einer Transaktion beansprucht (zwei `--apply`-Prozesse senden nicht doppelt), `invited`
wird nach dem Lauf aus den `sent`-Records abgeleitet statt hochgezählt; das Offline-CLI kanonisiert Packs ohne
`runHash` wie der Web-Verifier; ein Route-Test (`tests/audit-pack-route-boundary.spec.ts`, Emulator) prüft
die Signaturgrenze durch `/api/runs/create` und `/api/audit-pack/create` hindurch. Widerlegt: der Redaktor
hatte meine eigene Widerlegungsbegründung als Secret gelesen (Zuweisungsform) — umformuliert, mit
`redactSecrets` gegengeprüft.

**QA-Rundenzeit (Frage Sonny 16.09.2026):** eine Runde auf `dev` dauert 14–17 min — Modell 8–125 s,
`validate` ~7 min, Cloud-Run-Deploy ~7 min. Ein anderes Flash-Modell wäre der falsche Hebel (Luna: 0,3–7 Cent
je Runde). Entscheidung Sonny: **Option 1 jetzt** — `await.mjs` liefert die Befunde, sobald der Review-Job
fertig ist (Exit 3, Smoke „pending"), und wartet nur bei sauberer Review auf den Smoke-Check
(`waitForJob` in `scripts/qa/lib/gh.mjs`; Runbook §4 und Skill angepasst); **Option 2 als Roadmap-Punkt** —
Dockerfile mit Layer-Cache statt Buildpack, Phase 0 „daneben". Modell und Effort bleiben.

**Roadmap-Ergänzung (Sonny 16.09.2026):** in der Business-Sicht zeigen Prozesskarte, Prozesskette und
Standard-Fit-Tabellen an jedem Element mit Standardkandidat direkt die Anpassungsoptionen, die je
Betriebsmodell (Public Edition, Private Edition/RISE) näher an Fit-to-Standard führen — neuer Schritt **7.8**,
deterministisch aus Katalog, Level und Scope Item, mit Evidenzstufe und *Not determined* statt erfundenem Weg.

**0.8 gebaut (16.09.2026, `dev`, nach 0.12 auf Sonnys „fahre fort"):** das Board-Deck besiegelt null Befunde nicht
mehr als „Unconditional Go-Live Approved / LOW RISK" (UX-002, critical), sondern sagt „not determined" — ein
triviales Programm und ein gestürzter Detektor kommen beide als leere Liste an, und die Delivery-Seite zeigt den
Fehler jetzt; kein „Approved" mehr aus dem statischen Roll-up, der Sign-off wird gemeldet, wie er ist; „Resolved
Objects" war Objektzahl minus Befundzahl und heißt jetzt „Findings by Level". Test dreht das Alte um.

**QA-Runde 3 zu 0.12 (`79e7577`, Review-first live: Befunde nach 2 min):** drei Mediums, alle bestätigt und behoben —
`invited` wird in derselben Transaktion gezählt und geschrieben, der Route-Test leitet seine Verbotsliste aus dem
ganzen Fixture ab, der Survey-Guard prüft wieder die Reihenfolge. CISO-Effort `medium` (Entscheidung Sonny).

**QA-Runde 4 (`efb7d24`, 0.8 + Runde 3):** fünf Mediums, alle bestätigt und behoben — der leere Deck sagt jetzt auch
auf Folie 2 und 5 „not determined" statt „Fully Supported"/„0 zu tun"; der Route-Test prüft die Enum-Fälschungen
feldgenau und nutzt einen Sentinel, der den alten Wert nicht enthält; die Survey-Outbox ist ein Modul
(`lib/survey/outbox.ts`) mit Emulator-Test (`tests/survey-outbox.spec.ts`: zehn parallele Claims → genau einer
gewinnt; der Zähler ist transaktional und fällt nie unter einen gespeicherten Wert), der Quelltext-Guard prüft nur
noch die Verdrahtung. Bemerkenswert: der Admin-SDK läuft aus einer Playwright-Spec gegen den Emulator — das
öffnet 0.17 (Emulator-Tests statt Quelltext-Greps) einen einfachen Weg.

**QA-Runde 5 (`9f4cede`):** vier Mediums — der leere Deck zeigt auch die Coverage-Kennzahl nicht mehr als
Prozent (der Clean-Core-Score bleibt, als Wert des signierten Runs beschriftet); mein `` im Route-Test war als
Backspace-Byte in der Datei gelandet (Heredoc) und ist jetzt echte Wortgrenze, die Enum-Fälschungen werden je
Zielort geprüft; der Outbox-Test hat einen Loop-Harness (fünf Läufe, ein Provider-Aufruf), prüft die Monotonie der
committeten Zähler und die Konvergenz auf die Records. **Nicht belegbar gegen den Emulator:** das erzwungene
Interleaving „anderer Lauf schreibt unter der Transaktion" — Schreibzugriffe aus demselben Admin-Client während
einer offenen Transaktion wurden beim Neuversuch verworfen (Emulator-Verhalten, dokumentiert in
`lib/survey/outbox.ts`); die Zusicherung selbst (Kampagnendokument im Read-Set, `max(stored, counted)`) steht.

**QA-Runde 6 (`a3c2e16`):** die Wortgrenzen im Route-Test waren zum zweiten Mal Backspace-Bytes — jetzt als
Zeichenklassen ohne Backslash geschrieben, mit Laufzeit-Selbsttest. Lehre: Backslashes in Bash-Heredocs kommen
einfach an; Patch-Skripte mit Escapes über den Write-Weg oder ohne Escapes.

**0.13, Variante 2 geprüft (16.09.2026):** der Auth-Emulator (firebase-tools 15.30.1) kann **kein TOTP-MFA** —
`mfaEnrollment:start` verlangt `phoneEnrollmentInfo`; native TOTP wäre in CI nicht testbar. Zudem verlangt
Firebase eine verifizierte E-Mail vor dem Enrolment (`auth/unverified-email`), was unsere Passwort-Konten heute
nicht haben, und das Identity-Platform-Upgrade gilt für das eine Firebase-Projekt, das dev und prod teilen.
Entscheidung Sonny steht aus (siehe Bericht).

**v2.10.8 ist auf `main`** (Go Sonny 16.09.2026, nach sauberer Runde: 0.12, 0.8, die Antwort auf die
Vollprüfung, Review-first-Schleife, CISO `medium`). Die drei Release-Intakes (Security, UX, QA-Vollprüfung)
laufen; die UX-Review brachte einen unentschiedenen Befund (33a920d6be30, Roh-Fehlertext im Deck-Banner —
sofort behoben: verständliche Zeile mit nächstem Schritt, Technik einklappbar).

**Security-Agent ohne dev-Selbsttest** (Entscheidung Sonny 16.09.2026): der Workflow läuft nur noch auf
`main`; der Selbsttest bleibt von Hand startbar.

**0.13 gebaut, Variante 2** (Entscheidung Sonny 16.09.2026, nachdem klar war: er ist der einzige MFA-Nutzer,
sein Konto ist Google-verifiziert, Identity Platform kostet bis 50.000 MAU nichts): Firebase-native TOTP-MFA.
Kein ID-Token vor dem zweiten Faktor; die Server-Gates lesen `firebase.sign_in_second_factor` vom Token
(`lib/mfa-gate.ts`, rein und ohne Admin-SDK testbar); Enrolment im Browser gegen Firebase Auth, `enrolled`/
`disable` als Routen; der eigene TOTP-Apparat ist weg (Routen, `lib/mfa.ts`, `lib/totp.ts`, Cookie, Secrets,
Backup-Codes). Recovery über `scripts/mfa-reset.ts`, TOTP-Freischaltung über `scripts/mfa-enable-totp.ts`.
**Nächste Schritte, nur Sonny:** Identity-Platform-Upgrade in der Firebase-Console; dann sage ich, wann das
Freischalt-Skript läuft, prüfe Enrolment und Login auf `dev` gegen das echte Auth, und er richtet seinen
Faktor in den Einstellungen neu ein. Bis zum Upgrade schlägt jedes Enrolment mit einem Firebase-Fehler fehl —
das ist der erwartete Zustand, kein Bug. **Das Reset-Skript einmal für sein Konto laufen lassen** (`mfa-reset
<email> --apply`), bevor er nach dem Deploy anmeldet: sein Profil-Flag stammt vom alten TOTP; die Einstellungen
zeigen bis dahin „Set up again", und die mutierenden Routen verlangen einen Faktor, den es noch nicht gibt.

**0.14 läuft parallel** in einem eigenen Worktree (Agent), Ergebnis wird hier integriert.

**Offen für Sonny:** den überholten Bot-Branch löschen (`git push origin --delete chore/sync-cloudification-repo`);
`main` nach einer sauberen QA-Runde; die Survey-Workflows erst danach wieder einschalten; die
Resend-Tracking-Einstellung prüfen (3.0.9, nur mit Dashboard-Zugang möglich).

**Stand 15.09.2026, Feierabend — v2.9.12 → v2.10.7 auf `main` (3347122); dieser Abschluss-Eintrag liegt auf `dev`
und geht mit dem nächsten Release nach `main`, damit kein reiner Doku-Push das volle Audit erneut auslöst.** Der Tag hatte zwei Hälften:
morgens die drei Agenten und die ersten Roadmap-Schritte von Phase 0, nachmittags das Zielbild von 3.0.
Die Lehre: jede Vorlage, die ein Modell oder ein Agent lieferte, trug mindestens einen Fehler, der
erst beim Gegenlesen gegen den Code auffiel — „4 free runs" statt fünf Analyse-Läufen, ein Level-C für
eine Kundentabelle, Transparenz, die Text unter 4,5 : 1 drückt.

| Version | Was |
|---|---|
| v2.9.12–v2.9.16 | QA-Agent prüft jeden Push auf `dev` (versiegelt, mit Smoke) und zwei Runden an sich selbst; Security-Agent auditiert jede `main`-Version; kein „AI Studio" mehr im Repo |
| v2.9.17 | UX-Agent reviewt jede `main`-Version mit Screenshots |
| v2.10.0 | Roadmap 0.1: Live-Tests gegen einen Tenant gesperrt, mit Grund und Wiedereröffnung (`G0:R0`) |
| v2.10.1 | Roadmap 1.3: Anker-Check erkennt die Engine-IDs |
| v2.10.2 | Roadmap 0.2: kein Signavio-Import-Versprechen mehr |
| v2.10.3 | Roadmap 0.4: kein Geldbetrag ohne Annahmen-Revision |
| v2.10.4–v2.10.6 | QA-Runden als Klassen-Fixes; die gespeicherte Testsuite erscheint nach dem Neuladen und startet ausgewählt |
| v2.10.7 | DESIGN.md 1.4.2 und Mockups 2.8 abgenommen, SAP-Katalog aktuell, achtes Beispiel, SEO-Guard, Audit übersteht Ratenlimits |

Ohne Versionsnummer, aber mit Wirkung: QA auf GPT-5.6 Luna (`dev`) und Sol (Vollprüfung auf `main`),
Security-Agent auf DeepSeek V4.1 Flash als Pipeline ohne Werkzeuge, die UX-Vollprüfung von 7bdac5e
triagiert (69 bestätigt, 15 widerlegt, 2 zurückgestellt).

**Sonnys Entscheidungen heute (alle in `docs/design/decisions.md` bzw. `docs/ROADMAP.md`):**
- Fiori-Muster, nicht Fiori-Theme; kein Dark Mode; vorerst alles Englisch; Sichten immer
  Business · IT · Management.
- BPMN über das Minimum hinaus (mit User-Task und Datenspeicher), Navigation großer Prozesse über Ebenen.
- Vier Töpfe je Zielplattform, Retire aus Nutzung erst ab 13 Monaten und transparent, „Blocked by SAP"
  nur für Katalogobjekte ohne Nachfolger.
- Kosten: sieben Pflichtfelder, zwei Tagessätze. Glossar mit SAP- und Produktbegriffen, auch in
  „Ask this case", das immer über die eingebettete Hilfe-KI läuft.
- Coach Marks nur im Browser. Jedes Beispiel einmal frei, danach zählt jeder Start; nach fünf Analysen
  nur mit eigenem Schlüssel.
- Eine Demo für alle Konten auf Basis von `Z_MM_PO_APPROVAL`. Vor dem Hochladen Terms-Hinweis und
  belegte Vertrauensaussagen; der Community-Schlüssel ist ein bezahlter Gemini-Schlüssel.
- Die neue Landingpage mit echten Produktansichten gehört zu 3.0; Seiten mit Suchreichweite (Katalog
  u. a.) bleiben mit URL und Inhalt.
- Anbieter-Regel der Agenten bleibt (kein Fallback).

**Nach dem Push auf `main` (3347122, abends):**
- **UX-Review** (Delta, $0,26): 73 Befunde, fast alle aus der Vollprüfung übernommen; drei neue bestätigt und
  eingeplant — UX-087 (fehlender Debt-Wert in Grün) → 0.8, UX-088 („Clean Core Score" ohne Abgrenzung zu SAPs
  gegenläufigem Score) → 0.3, UX-089 (vier Begriffe für einen Wert) → 1.5.
- **QA-Vollprüfung** (GPT-5.6 Sol): `no_go`, 11 critical, 36 high, 95 medium, 2 low — sie sperrt nichts, wird aber
  **morgen als erster Schritt vor 0.8 verifiziert** (Entscheidung Sonny); sicherheitsrelevante Funde gehen ins
  versiegelte Register, öffentlich nur IDs.
- **Sofort eingedämmt (Entscheidung Sonny):** die beiden Survey-Workflows sind deaktiviert
  (`gh workflow enable` macht es rückgängig) und die Logs aller 38 Survey-Läufe auf GitHub gelöscht; die lokale
  Log-Ablage der GitHub-CLI ist geleert. Befunde d2006fdbfa95 und 4a593e8bd77b — die Skripte werden morgen zuerst
  korrigiert, bevor die Workflows wieder laufen. **Sonny prüft, ob eine Meldung nach DSGVO Art. 33/34 nötig ist.**
- **Security-Audit** auf `main` ohne Bericht: 57 Consultant-Aufrufe fehlerfrei, der CISO-Aufruf lieferte kein
  lesbares JSON. Ursache morgen klären (Größe der CISO-Eingabe, Antwortformat), dann neu starten.

**Offen und warum:**
- **Roadmap 0.8** (UX-002, critical): leere Befundliste ergibt noch „Fully Supported" — nach der Verifikation der
  kritischen QA-Befunde der nächste Schritt.
- **Terms §6** muss für Roadmap 0.9 neu gefasst werden (Beispiele: Wiederholung zählt) — Formulierung
  braucht Sonnys Freigabe, vermutlich neue Terms-Version mit erneuter Zustimmung.
- **Datenschutzerklärung** soll den bezahlten Tarif des Community-Schlüssels ausdrücklich nennen, bevor
  die Vertrauenskarte (0.11) es sagt.
- **UX-Agent fotografiert noch die Mockups 2.7** als Zielbild — Umstellung auf 2.8 als eigener kleiner Schritt.
- **Landingpage 3.0 abgenommen** (`docs/roadmap/clean-core-landing-v3_0.html`), in der Roadmap 1:1 (§5).
  Vor dem Livegang offen: Datenschutzerklärung nennt den Admin-Lesezugriff auf Projekte und den bezahlten
  Community-Schlüssel; ob `/catalog` einen Suchparameter liest; ob der Showroom nach `/how-it-works` zieht;
  Terms §6 spricht noch von „5 transformations".
- `E08-F01-US01` (Runner-Isolation) bleibt eigener Auftrag nach 2.10.

**15.09.2026 — Schritt 0.1 (`G0:R0`) gebaut, v2.10.0 auf `dev`.** Die Sperre der Live-Tests steht in
`lib/locked-paths.ts` und `SECURITY.md` §7.1; die Route prüft sie vor jeder Messung, rund 30 Texte
sind korrigiert. **Offen bleibt `E08-F01-US01`** (Runner-Isolation) als eigener Auftrag nach 2.10 —
er ist der einzige Weg, den Live-Modus zurückzugeben. Mitgefunden und korrigiert: „Browser-side
Encryption" und ein „isolated BTP proxy channel", die es beide nicht gibt.

**15.09.2026 — Roadmap auf Fassung 2.8 umgestellt und vereinfacht.** `docs/ROADMAP.md`
ist jetzt kurz und allein verbindlich; Gates und die 76 Teilschnitte sind durch
**Phasen 0–8 mit Schritten der Größe S/M** ersetzt. Entscheidungen von Sonny:

1. **Nach außen zählt 3.0** — der große UX-Umbau entlang der Mockups 2.7. Die
   Arbeitsstände v2.11–v2.18 bauen die neue Oberfläche hinter einem Admin-Schalter.
2. **Anmeldung und Konto bleiben unverändert.** Die Datensparsamkeit aus 2.7
   (Handle, Namensfelder entfernen, Migration) ist gestrichen.
3. **Rollen sind nur Sichten** (Management · Business · IT), ohne Einfluss auf die
   Auditierbarkeit; kein „Playing as", kein `self_play`. Die Verantwortung bleibt
   beim angemeldeten Nutzer.
4. **Teilen = Einsicht per Einladung**: Link an eine E-Mail-Adresse, öffnet nur für
   ein Konto mit genau dieser, bestätigten Adresse; inklusive Quellcode, der Dialog
   sagt es.
5. **Die Business-Sicht legt deutlich zu:** BPMN-Rekonstruktion aus dem Code mit
   Zeilenankern, Editor nah an Signavio (keine Kopie), Import/Export als BPMN 2.0
   XML für Signavio-Lizenznehmer — Phasen 2–4, direkt nach dem Gerüst.

Befunde beim Umbau: **der Anker-Check erkannte die Engine-IDs nicht** (`CC-001` gegen
Parser-Muster `[F-…]`) — Schritt 1.3, **behoben in v2.10.1**; die Oberfläche verspricht
einen **Signavio-Import, der nie geprüft wurde** — Schritt 0.2, **zurückgenommen in v2.10.2**
(Facts-Service, Copy-CI und Audit-Korrekturen aus 0.2 sind noch offen).

**Aufgeräumt am selben Tag:** jede frühere Roadmap liegt jetzt in `docs/archiv/`
(Index `docs/archiv/README.md`) — `ROADMAP-2.0.md` und das Bündel der Fassung 2.7
unter `docs/archiv/roadmap-2.7/`, darin auch die Fassung 2.7 selbst als
`ROADMAP-2.7.md` und der Review vom 08.09., den ältere Einträge hier
`roadmap_chatgpt.md` nennen. Aktiv in `docs/roadmap/` bleiben nur die Mockups und
`SCHNITT-0-UMFANG.md`.

**Die Roadmap liegt seit dem 12.09.2026 im Repo:** `docs/ROADMAP.md` (damals
Fassung 2.7 — Gates R0/R1/R2/3.0, 76 Teilschnitte).

**Der Umfang von Release 2.10 ist am 12.09. abgestimmt** — der Punkt vom 11.09.
(„wird vor Beginn im Umfang abgestimmt") ist damit geschlossen. Vier
Entscheidungen von Sonny:

1. **Stufe „Kern + Fundament"** — sieben Teilschnitte: `G0:R0`, Facts-Service und
   Copy-CI, Level-Regelseite und Score-Umbau, keine Geldwerte ohne
   Annahmenrevision, Manifestvertrag, konservative Invalidierung, Freigabefelder
   nur über servervalidierte Commands. Der Referenzkorpus läuft daneben, weil er
   an einem externen Prüfer hängt. **Erhaltungsregister und Zero-LLM-Sperrpfad
   rutschen auf v2.11.**
2. **`G0:R0` wird über die dokumentierte Sperre geschlossen**, nicht über die
   Runner-Isolation: Grenze, Grund und Wiedereröffnungsbedingung nach `SECURITY.md`,
   Live-Modus bleibt zu. `E08-F01-US01` bleibt als eigener Auftrag nach 2.10 offen.
3. **Datensparsamkeit vertagt auf Schnitt A.** Am Profil ändert sich in 2.10
   nichts (14 Dateien, ~62 Fundstellen, drei Mail-Skripte mit Vornamensanrede).
   Bedingung: keine Oberfläche behauptet vorher, es würden nur Handles gespeichert.
4. **Öffentliche Texte nur dort, wo sie falsch sind** — Audit-Korrekturen plus
   Score-Umbenennung und TCO-Versprechen. Die Spielwiesen-Positionierung auf
   Startseite und README bleibt ein eigener, späterer Auftrag.

Details je Teilschnitt mit Dateien und Abnahmefall: `docs/roadmap/SCHNITT-0-UMFANG.md`.

**Stand 11.09.2026, Feierabend — v2.9.5 → v2.9.11, sieben Releases, alles auf
`main` und deployt (`clean-core-00298-kvn`, `main` = `dev` = Branch = `c1349b5`).**
Der Tag hatte einen roten Faden und eine Lehre. Der Faden: die Roadmap
(`roadmap_chatgpt.md`), Release 2.9 „Truth & Safety", Punkt für Punkt — am Abend
ist der Entwicklungsumfang von 2.9 erledigt. Die Lehre: die teuersten Funde kamen
wieder nicht aus der Roadmap, sondern beim Anfassen des Codes daneben.

| Release | Was | Befund |
|---|---|---|
| v2.9.5 | Ein Phasenvertrag (`lib/workflow-steps.ts`) für Stepper, Rail, Dashboard, Delivery; Economics ist Phase 6; `status` wird nicht mehr gelesen; Testentwurf ≠ getestet | CR-11, E01-F01-US01 (+ CR-16-Reste) |
| v2.9.6 | Quellenänderung macht alles Alte `stale`; Transformation/Doku/Testing/Handover gesperrt; Audit-Pack 409 serverseitig | E01-F01-US02, CR-10 (2.9-Teil) |
| v2.9.7 | Nutzungsimport: Datumsformat und Fenster deklariert, Quarantäne, Vorschau — und überhaupt gespeichert | E03-F02, CR-24 |
| v2.9.8 | Economics: keine Einsparprognose ohne eigene Kostenwerte, Modell als Demonstration gekennzeichnet | E12-F01-US02, CR-23 (2.9-Teil) |
| v2.9.9 | Teststatus: Skipped/Todo/Connectivity/Error, Live-ABAP ohne falsches `Passed`, Stubs benannt | E07-F01, CR-12/13/14 |
| v2.9.10 | `npm run typecheck` (Tests inklusive) als Pflichtschritt vor dem Deploy | E16-F01-US02 |
| v2.9.11 | Roter Scheduled-Run von Security CI → Mail an den Admin | Betrieb (10.09.) |

Tests: von 555 auf **608**, jeder Release lokal CI-gleich (Produktions-Build,
frische Emulatoren, ganzes Log durchsucht) und danach auf `dev` und in Produktion
über `/api/health`, Revision und Logs geprüft. Lint-Budget 673 → **661**.

**Die Funde außerhalb der Roadmap — die eigentliche Ausbeute:**
- Der **Nutzungsimport wurde nie gespeichert.** `undefined` im Bericht, der
  Firestore-Client lehnt das ab, die Analyze-Seite hat es nur geloggt. Direkt am
  SDK nachgeprüft. Wer Nutzungsdaten hochgeladen hat, hatte sie nur im Tab.
- Das Dashboard **erfand einen „Quality Engineering Report"** („All test cases
  compiled and executed successfully") für jede generierte Suite.
- Der Live-ABAP-Pfad meldete Erreichbarkeit und Login als **`Passed`**, die
  CSRF-Zeile ohne dass je eine CSRF-Anfrage gestellt wurde.
- Die Rail existierte auf vier von sechs Seiten nur im Ladezustand; Delivery
  eröffnete jedes Projekt mit „lifecycle is complete"; Economics rechnete mit
  900/650/15.000 €, die niemand eingegeben hatte.
- Zwei Typfehler in einem Test standen seit dem 27.08. da, weil nie `tsc` über
  die Tests lief.

**Entscheidungen von Sonny heute:** Security-CI-Alarm **per Mail, nicht als
Issue** (Repo ist öffentlich) — umgesetzt, TEST-Mail von Resend angenommen
(`549c4fe9-…`), Zustellung nur im Posteingang prüfbar. **E08-F01-US01 später.**
**Release 2.10 wird vor Beginn im Umfang abgestimmt** — nicht von selbst anfangen.

**Offen für den 2.9-Exit:** nur noch **E08-F01-US01 — echte Runner-Isolation**
(Felix, GCP). Bis dahin hält die Attestierung aus v2.9.1 den Live-Modus zu.
CR-28 ist im 2.9-Teil erfüllt (widerrufbar, als Selbsterklärung bezeichnet, seit
v2.9.6 an die Quelle gebunden); Rollen/Attestation sind E05/E13 in 3.0. CR-23 im
Kern ist E12-F02.

**Bewusst offen gelassen, mit Namen:**
- Die Testing-Seite **speichert keine Verdikte**. Testing und Delivery bleiben
  deshalb in echten Projekten `partial`. Richtig ist ein serverseitiger
  Test-Receipt (E07-F02), kein Client-Schreiben von `Passed`.
- Projekte, deren Quelle sich **vor** v2.9.6 geändert hat, zeigen alte Artefakte
  in den Ansichten weiter als aktuell; nur die Freigabe prüft der Server für sie
  nach (aus der Run-Historie).
- **Kopfzeile auf Projektseiten 22 px zu breit bei 390 px** (Nutzermenü +
  Avatar) — vorbestehend, beim Screenshot-Check aufgefallen, nicht angefasst.
- Bestehende Nutzungsberichte haben kein deklariertes Fenster; seit v2.9.7
  schlagen sie deshalb keine Stilllegung mehr auf eine Null vor. Gewollt.

**Für den nächsten, der hier arbeitet:**
- `firestore.rules` wird **nicht von CI deployt**. Braucht ein Feature ein neues
  Client-Feld, ist das ein manueller Produktions-Deploy vor der App. v2.9.6 hat
  den Umweg über serverseitig geschriebene Felder genommen und brauchte keinen.
- Versionsnummern in Kommentaren nur als `pre-vX.Y.Z` oder `// vX.Y.Z:` — alles
  andere macht `version-drift-guard` rot, sobald die Version weiterzieht (zweimal
  passiert, 10.09. und 11.09., beide Male lokal gefangen).
- Die Befundliste in dieser Datei war gestern unvollständig (CR-24 fehlte). Eine
  Exit-Liste ist eine Behauptung; aus `Release 2.9` in §12 der Roadmap und dem
  Code neu ableiten.

**Unverändert offen:** die ~30 ungeprüften GLM/GPT-Findings, G-05/G-06,
V15/V16/V18, die drei Tenant-Mails, Befund v4 Mitte September, die sieben
Moderate-Advisories unter der Gate-Schwelle, DKIM auf 2048 bit.

---

**Stand 10.09.2026, Feierabend — v2.9.0 → v2.9.4, fünf Releases, alles auf `main`
und deployt.** Der Tag hatte einen Auslöser und einen roten Faden. Der Auslöser:
fünf Feature-Commits lagen seit dem 08./09.09. unveröffentlicht auf dem Branch,
und v2.8.6 war nie auf `main` gekommen. Der rote Faden ab v2.9.1: die Roadmap
(`roadmap_chatgpt.md`, 16 Epics / 64 Features / 128 Stories) statt eigener
Priorisierung.

**Was rausging:**

| Release | Was | Befund |
|---|---|---|
| v2.9.0 | Ed25519 neben HMAC, `/method/levels`, beide SAP-Sichten auf Objektseiten, Narrative-Anker auf Codezeilen | CR-01, CR-26 |
| — | `fix(deps)`: kritisches Next.js-RCE, das **in Produktion lief** | — |
| v2.9.1 | Runner-Egress wird gemessen statt behauptet | CR-15 / E08-F01-US02 |
| v2.9.2 | „Keine Befunde" ≠ „nichts zu finden": Abdeckungsbericht neben den Befunden | CR-06 |
| v2.9.3 | Eigene Z-Tabelle zwingt nicht mehr vom Stack (Private on-stack, Public → BTP) | CR-04 |
| v2.9.4 | Keine nicht endliche Zahl erreicht ein Diagramm | E12-F01-US01 |

**Der Tag in einer Zeile:** Vier der fünf Releases haben nichts Neues gebaut,
sondern eine Behauptung eingeholt, die das Produkt schon gemacht hat — und der
teuerste Fund kam nicht aus der Roadmap, sondern daraus, dass ein Push die
Security-Gates rot gemacht hat.

**Drei Dinge, die dabei aufgefallen sind und die bleiben:**

1. **Security CI stand seit dem 07.09. rot, und niemand hat es gesehen.** Der
   Montags-Cron und die Push-Trigger melden nichts; ohne einen Push nach
   `main`/`dev` fällt eine rote Abhängigkeitsprüfung niemandem auf. Drei Tage
   lang lief ein kritisches Next.js-RCE in Produktion. **Offen: eine
   Benachrichtigung, die einen roten Scheduled-Run sichtbar macht** (Issue
   öffnen/aktualisieren statt still scheitern).
2. **Dieselbe Fehlerform zum dritten Mal:** ein `overrides`-Eintrag, dessen
   Untergrenze exakt auf der Lücke sitzt (`fast-uri` in v2.8.6, jetzt `sharp`
   `^0.35.3` gegen `<0.35.4` und `js-yaml` `^3.15.1` gegen `<3.15.2`). Ein Caret
   hebt nichts an, was den Bereich schon erfüllt. Drei Vorkommen sind ein Muster,
   kein Zufall.
3. **Der Content-Datums-Generator war seit v2.7.2 kaputt** — jener Release hat
   `withTwitterCard()` über 18 Seiten gezogen, und „neuester Commit gewinnt" las
   das als 18 gleichzeitig geänderte Seiten. Behoben; der Generator überspringt
   jetzt reine Plumbing-Commits.

**Offen für den 2.9-Exit (aus dem Befundregister):**

| # | Punkt | Wer | Warum |
|---|---|---|---|
| 1 | **CR-11 — kanonische Phasen** | Entwicklung | Upload/Analyze getrennt, TCO fehlt, Testing zählt *erzeugte* Fälle |
| 2 | **CR-28 — Sign-off als revidierbare Selbsterklärung** (P1) | Entwicklung | Freigabeattribute sind client-schreibbare Projektfelder |
| 3 | **E08-F01-US01 — echte Runner-Isolation** | **Felix (GCP)** | eigener Einmal-Runner, minimales Dienstkonto, nachgewiesene Egress-Regeln. Bis dahin hält die Attestierung aus v2.9.1 den Live-Modus zu — korrekt, denn der Container hat offenen Egress |
| 4 | **CR-23 — TCO-Annahmen empirisch** | Entwicklung | Koeffizienten (2,5/0,8/1,8/0,6 Tage je 1.000 Zeilen), 85-%-Testannahme, Zielscore 95 sind nicht aus beobachteten Aufwänden abgeleitet → E12-F02, Release 2.10 |

**Ebenfalls neu offen:** die sieben verbliebenen Moderate-Advisories (`mermaid`,
`qs`/`express`, `protobufjs`) liegen unter der Gate-Schwelle und bleiben liegen.
**DKIM auf 2048 bit** war für „nach dem 09.09." vorgemerkt — ab jetzt möglich.

**Unverändert offen:** die ~30 ungeprüften GLM/GPT-Findings, G-06, die 673
geparkten Lint-Warnungen (von 677 heruntergezogen), G-05, V15/V16/V18, die drei
Tenant-Mails, Befund v4 Mitte September.

**Eine Selbstkorrektur fürs Protokoll:** v2.9.4 ging rot nach `dev`, weil ich
einen grünen Lauf gemeldet habe, der keiner war. `rtk proxy` gab Exit 0 für einen
fehlgeschlagenen Playwright-Lauf zurück *und* filterte die Zeile `1 failed` aus
der Ausgabe, die ich gelesen habe. Beide Signale waren einig und beide falsch.
CI hat es gefangen, der Deploy war blockiert, Produktion war nie betroffen. Lehre:
Testkommandos unverpackt ausführen und das ganze Log durchsuchen, nicht das Ende.

---

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
> **[docs/SCREENING-GCP-ALTLASTEN.md](./SCREENING-GCP-ALTLASTEN.md)**.
> Grösster Posten dort: 676 Container-Images in europe-west1, aufgelaufen aus
> 252 nie aufgeräumten Cloud-Run-Revisionen.

**Warum:** Aus der Prototyp-Phase laufen zwei veraltete Deployments weiter,
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
