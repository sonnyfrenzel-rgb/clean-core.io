# Referenzkorpus v2 — gemeinsames Briefing für alle Fallautoren

Dieses Briefing ist für jeden Autor identisch. Was hier steht, gilt ohne Ausnahme.

## Was du baust

Neue Fälle für den **Referenzkorpus v2** von Clean-Core.io. Der Korpus ist die Sammlung von ABAP-Fällen, zu denen die richtige Antwort *vorher* feststeht, damit die deterministische Engine (`lib/abap/`) widerlegt werden kann. v1 hat 25 Fälle (CC-001 bis CC-025). Vier unabhängige Modellreviews (Grok 4.6, GLM 5.3, Claude Fable 5.1, DeepSeek v4 Pro) haben ihn mit zusammen ~460 Fällen angegriffen und **einstimmig „nicht freigeben"** gesagt. Ihre systematischen Lücken konvergieren. Du schließt eine dieser Lückenklassen.

## Die Quellen, die du lesen musst

1. **`C:/Users/felix/OneDrive/Desktop/referenzkorpus-v1.md`** — der Korpus. Lies §2–§7 (Zeilen 34–116, der Vertrag), §16 (Konstruktklassen), §18 (Regelregister, Zeilen 300–333) und **CC-001 vollständig als Formatvorlage** (`awk '/^## CC-001 /,/^## CC-002 /'`). Dein Fall muss exakt dieses Format haben.
2. **Die vier Reviews** in `C:/Users/felix/AppData/Local/Temp/claude/c--Users-felix-antigravity-Project-Platform/49b7a0e8-fdda-4bf0-a419-c564dc2cb0b2/scratchpad/korpus-out/`: `grok.md` (IDs H-nnn), `glm.md` (A-nnn), `fable.md` (KA-nnn), `deepseek.md` (CC-GAP-nnn). Dein Auftrag nennt die IDs, die zu deiner Klasse gehören. Lies genau diese Zeilen und die zugehörigen ausgeschriebenen Fälle in Abschnitt 3 der Berichte. Nicht die ganzen Berichte.
3. **`C:/Users/felix/OneDrive/Desktop/abap-realcode-pruefung.md`** §7 (Zeilen 146–192): die fünf Fehlerfamilien des Vergleichers. Dein Fall darf keine davon auslösen.

## Die zehn Regeln

1. **Eng geschnitten.** Ein Fall prüft *eine* Ursache. Eine Abweichung muss einer überprüfbaren Ursache zuzuordnen sein. 10–30 Zeilen ABAP. Kein Fall, der drei Dinge gleichzeitig testet — das sind drei Fälle.
2. **Kein Import.** Die ~460 Modellfälle sind eine Angriffsflächenkarte, kein Fallmaterial. Du *destillierst*: aus fünf Modellfällen, die dieselbe Sache treffen, wird ein Korpusfall. Jeder Korpusfall trägt eine Zeile **Konvergenz:** mit den Modell-IDs, aus denen er destilliert ist (z. B. `Konvergenz: Grok H-023, H-024 · GLM A-017 · Fable KA-042 · DeepSeek CC-GAP-003`). Ein Fall, den nur ein Modell nennt, ist erlaubt, wenn er kritisch ist — dann steht es dabei.
3. **Beleggrad, ehrlich.** Jeder Fall trägt `Beleggrad: konstruiert` (Muster aus realem Code nachgebaut, keine Fundstelle), `erinnert` (für real gehalten, nicht belegbar) oder `verifiziert` — und *verifiziert* heißt hier ausschließlich: **die genannten SAP-Objekte, Syntaxelemente und das dokumentierte Verhalten existieren sicher** (ABAP-Schlüsselwortdokumentation, SAP-Hilfe). Es heißt nie „diese Codestelle existiert an einem Ort". Erfinde keine GitHub-URL, keine Zeilennummer, keinen Repository- oder Methodennamen. Ein erfundener Beleg vergiftet den Korpus.
4. **Der Schlüssel ist (Quelle, Zielprofil).** Jeder Fall trägt einen Block `**Zielprofil:**` mit `edition` (`onpremise-s4` | `private-cloud` | `btp-abap-environment` | `ecc-6`), `abap_language_version` (`standard` | `abap-for-cloud`), `release` (z. B. `S/4HANA 2023`), `catalog_revision` (`PCE2022-objectReleaseInfo` oder `n/a`) und `rule_revision`. Die Sollantwort gilt **nur** für dieses Profil. Wo dieselbe Quelle in einem zweiten Profil eine andere richtige Antwort hat, sag es in einer Zeile `**Zweites Profil:**` — oder mach ein Fallpaar daraus, wenn dein Auftrag es verlangt.
5. **Anker = Statementbeginn.** Der Primäranker jedes Befunds ist die Zeile, auf der das Statement *beginnt*, plus ein Tokenoffset, wo nötig (`source.abap:5` oder `source.abap:5+2`). Eine Literalzeile oder eine Bereichsangabe ist nur Sekundäranker und wird als solche gekennzeichnet. Bei Makros: Wirkungsort ist die *Aufrufstelle*, die Definition ist Sekundäranker. Bei Kettensätzen (`PERFORM: a, b, c.`): ein Anker je Glied mit Tokenoffset.
6. **Unknown ist eine Antwort.** Wo jede statische Antwort eine Annahme wäre (dynamisches Ziel, fehlende Quelle, Laufzeitkontext), ist die richtige Sollantwort `Unknown` **plus** ein Befund, der sagt, *warum* — und `known_worst_level` getrennt davon. Rate nie C oder D, um eine Antwort zu haben.
7. **Level kann „unsicher" nicht sagen.** Wo dein Fall ein Sicherheits- oder Berechtigungsproblem trägt, kommt das in eine eigene Aussageklasse `security_and_authorization` mit eigenem Befund. Es verändert das A–D-Level nicht und wird nicht in das Level hineingemogelt.
8. **Kein Fachsatz ohne Träger.** Jeder Fachsatz (B-Aussage) nennt Anker *und* Kontrollkontext (Bedingung, Zweig, Abbruchpfad davor). Ein Satz über Persistenz nennt den COMMIT, oder er sagt „angekündigt, nicht persistiert". Ein Satz über Berechtigung nennt die Auswertung von `sy-subrc`, oder er sagt „geprüft ohne Wirkung".
9. **Prozessskelett ist As-is.** Knotentypen aus v1 (`start`, `read`, `write`, `gateway`, `output`, `end`, `loop`, `call-opaque`, `transaction`) plus die neuen aus deinem Auftrag, wenn er welche einführt (`update_task`, `rfc`, `async`, `authorization`, `external_program`, `event_block`). Keine erfundenen Menschen, keine Reviewaktivitäten, kein Genehmigungsworkflow aus einem Statusfeld.
10. **Handarbeit und Stunden wie v1.** `work_items` konkret; Stunden optimistisch/wahrscheinlich/pessimistisch als *unkalibrierte Autorenannahme*; `actual_hours = null`. Und die Prüferfragen am Ende — in v2 heißen sie **Offene Prüferfragen** und sind ehrlich: was ein SAP-Architekt bestätigen müsste, damit dieser Fall mehr als ein Kandidat ist.

## Was jeder Fall zusätzlich zu v1 trägt

Direkt unter dem Titel, nach der v1-Kopfzeile:

```
**Konvergenz:** Grok H-nnn · GLM A-nnn · Fable KA-nnn · DeepSeek CC-GAP-nnn
**Beleggrad:** konstruiert | erinnert | verifiziert (Syntax/Objekte)
**Zielprofil:** edition=… · abap_language_version=… · release=… · catalog_revision=… · rule_revision=…
**Zweites Profil:** (nur wenn die Antwort dort anders wäre — eine Zeile, oder Verweis auf den Partnerfall)
**Unabhängigkeit:** modellreview | abaplint | metamorph | sap-doku | keine — welche der Prüfungen diesen Fall schon getroffen haben; „keine" ist eine erlaubte, ehrliche Antwort
```

Der Schlussblock heißt in v2:

```
**Freigabestatus:** candidate / not independently signed. Geprüft durch: <Liste>. Nicht geprüft durch: externen SAP-Architekten.
```

## Neue Regeln, die du benutzen darfst (v2-Regelregister, vorläufige Nummern)

| Regel | Inhalt |
|---|---|
| R13a | Literal ohne Konsument ist kein Statement (v1-R13, verengt) |
| R13b | Literal mit Konsument (ADBC, EXEC SQL, GENERATE, ASSIGN (…), RTTI describe_by_name, CREATE DATA TYPE (…), CALL TRANSACTION USING, BDC-Feld, Callback-FORM-Name) **ist** eine Abhängigkeit oder Code; Level und Befund folgen dem Konsumenten |
| R25 | LUW: Ausführung im Update Task erfolgt beim COMMIT, nicht an der Aufrufstelle; implizite Commits (RFC, WAIT, CALL SCREEN/TRANSACTION, LEAVE TO TRANSACTION, SUBMIT AND RETURN) sind Transaktionsknoten; ROLLBACK verwirft |
| R26 | Dynamisches FROM/WHERE/DML-Ziel: Zielmenge Unknown, `known_worst_level` D; Herkunft der Variable (Customizing, Eingabe, Konstante) als Kontextbeleg |
| R27 | Makro: Befund am Aufrufort, Definition Sekundäranker; Kettensatz: ein Anker je Glied |
| R28 | Aussageklasse `security_and_authorization`: AUTHORITY-CHECK ohne sy-subrc-Auswertung = „geprüft ohne Wirkung"; PRIVILEGED ACCESS = „DCL umgangen"; generischer Tabellenzugriff, usr02, OS-Befehl = eigener Befund; verändert das Level nicht |
| R29 | Typabhängigkeit außerhalb SQL (`TYPE kna1`, `INCLUDE STRUCTURE`, `TABLES`, `SELECT-OPTIONS FOR`, `NODES`, `INFOTYPES`) ist eine DDIC-Abhängigkeit; Nachfolger auf Strukturebene, nicht der CDS-Lesenachfolger |
| R30 | Kundeneigene Objekte tragen `release_contract` (C0/C1/none); `known_worst` stoppt an einem freigegebenen Wrapper nicht — die Implementierung zählt |
| R31 | Dieselbe Quelle, zwei Zielprofile, zwei Antworten: ein Fallpaar. Eine Engine ohne Profil im Schlüssel besteht v2 nicht |
| R32 | Hostkontext ist oft syntaktisch erkennbar (`ENHANCEMENT…ENDENHANCEMENT`, `CALL CUSTOMER-FUNCTION`, `IF_EX_*`, `ZX*`-Includes, `MV45AFZZ`); wo nicht, bleibt v1-R10/CC-010 |
| R33 | Klassische Ereignisblöcke (`INITIALIZATION`, `AT SELECTION-SCREEN`, `GET`, `AT LINE-SELECTION`, `TOP-OF-PAGE`) und LDB-Bindung sind Startknoten und Kontrollfluss, auch ohne `START-OF-SELECTION` |
| R34 | Programmübergreifend (`SUBMIT`, `CALL TRANSACTION`, `LEAVE TO TRANSACTION`, `DESTINATION`): Systemgrenze als `external_program`-Knoten, opak, mit impliziter Commit-Semantik nach R25 |

Nur die Regeln benutzen, die dein Auftrag nennt. Keine weiteren erfinden — wenn dir eine fehlt, schreib es in **Offene Prüferfragen** und in deinen Bericht.

## Ausgabe

Eine Datei je Autor: `C:/Users/felix/AppData/Local/Temp/claude/c--Users-felix-antigravity-Project-Platform/49b7a0e8-fdda-4bf0-a419-c564dc2cb0b2/scratchpad/korpus-v2/<klasse>.md` mit allen Fällen deiner Klasse hintereinander, jeder im v1-Format plus den v2-Zusätzen, getrennt durch `---`. Deutsch. Die Fall-IDs nimmst du aus dem Bereich, den dein Auftrag nennt.

Am Ende der Datei ein Abschnitt `## Autorenbericht` (max. 25 Zeilen): welche Modellfälle du **nicht** aufgenommen hast und warum; wo du dir unsicher bist; welche Regel dir gefehlt hat. Dieser Abschnitt ist für den Zusammenführer, nicht für den Korpus.

Schreib nichts ins Repository. Führe keine Engine aus, es sei denn, dein Auftrag sagt es. Behaupte nichts ausgeführt zu haben.
