# Referenzkorpus v2 — Fallprüfbögen Stufe A

**Stand:** 16. September 2026. **Modus:** nicht blindes KI-Gegenreview, keine externe menschliche Freigabe.

Die zehn Bögen beurteilen den Quell-/Profil-/Sollumfang aus dem Auftrag. Es gibt keine nachträglich behauptete Phase 1. Sicherheiten beziehen sich auf die jeweils eingegrenzte Reviewaussage; native Tests und persönliche Kundenerfahrung werden nicht erfunden. Die Referenzen S01–S28 sind im Hauptbericht und in `evidence/sources.json` aufgelöst.

**Umfang:** 10 Fallprüfbögen, 29 Fachsatzvergleiche, 48 ausdrücklich beantwortete Fragen. Frühere Angaben zu v1-Tests oder Produktenginefehlern werden nicht als eigene Ausführung dieser Runde übernommen.


---

## CC-034 — ADBC: das Stringtemplate wird als SQL ausgeführt (Gegenstück zu CC-016)

**Urteil:** D-Befund bestätigt; unbedingte Kunden-/Mandantenaussage widersprochen.

**Original:** `referenzkorpus-v2.md`, ab Zeile 5466. **Zielprofil gelesen:** ja. **Modus:** nicht blind. **Native Ausführung:** nicht erfolgt.

### 1. Level und Bewertungsumfang

| Feld | Reviewantwort | Sicherheit |
|---|---|---|
| `classic_extension.level` | D | sicher; Bedingungen siehe Begründung |
| `known_worst_level` | D, für den belegten nicht unterstützten Schreibweg | sicher; Bedingungen siehe Begründung |
| `cloud_api_surface` | not_usable | sicher; Bedingungen siehe Begründung |
| `cloud_artefact` | not_activatable | sicher; Bedingungen siehe Begründung |

D folgt aus dem expliziten nicht unterstützten KNA1-Schreibzugriff auf der stipulierten Standardverbindung, nicht aus einer geratenen Freigabeklasse von CL_SQL_STATEMENT. Die ungereinigten Eingaben verhindern jedoch die garantierte Begrenzung auf genau den beabsichtigten Kunden/Mandanten. Ein konkreter DB-Fehler oder ein fehlender Datensatz bedeutet außerdem nicht, dass die beabsichtigte Änderung stattfindet. [S01,S10,S11]

### 2. Erwartete Befunde

Schweregrade sind Reviewprioritäten, keine SAP-ATC-Nummern.

| Statementbeginn | Konstrukt / Regel | Schwere | Reviewbefund |
|---|---|---|---|
| 11 | Unsicherer Textaufbau / R28 | hoch | Benutzereingabe fließt in SQL-Text; Guard auf nichtleeren Schlüssel ist kein Escaping und keine Allowlist. |
| 15 | Interpretierender Konsument / R13b | hoch | EXECUTE_UPDATE verarbeitet den konstruierten Text als SQL; kein R13a-Negativfall. |
| 15 | SAP-Tabellenschreiben / R02 | hoch | Nicht unterstütztes direktes UPDATE KNA1: D im dokumentierten Standardverbindungs-Kontext. |
| 16 | Exceptionpfad / R19 | mittel | CX_SQL_EXCEPTION führt zum modellierten Rollback/Abbruch; keine weiteren Exceptions erfinden. |
| 26 | Transaktionsabschluss / R25 | mittel | Commit der Standardverbindung im normalen Nichtnull-Pfad; keine Erfolgs-/Scopegarantie allein aus dem Ausgabetext. |

### 3. SAP-Objekte und Nachfolger

| Objekt | Typisierte Identität | Nachfolger / Begründung | Drop-in |
|---|---|---|---|
| KNA1 | TABL/KNA1; TABL/KNA1 | DDLS/I_CUSTOMER; CDS_STOB/I_CUSTOMER, Lesenachfolger beobachtet [S19] | nein für UPDATE |
| CL_SQL_STATEMENT | CLAS/CL_SQL_STATEMENT; CLAS/CL_SQL_STATEMENT | Eigener Nachfolger-/Freigabestatus nicht hinreichend belegt | offen |
| CX_SQL_EXCEPTION | CLAS/CX_SQL_EXCEPTION; CLAS/CX_SQL_EXCEPTION | Exceptiontyp an Zeile 16, in der ursprünglichen Objektliste ergänzen; Metadaten separat nachsehen | nicht beurteilt |

### 4. Fachsätze — Vergleich mit dem vorgelegten Soll

| Satz | Vergleichsurteil | Präzise Reviewfassung | Quellanker |
|---|---|---|---|
| B01 | stimme zu | Bei initialem p_kunnr wird NO_KEY ausgegeben und vor dem SQL-Aufbau zurückgekehrt. | 7–10 |
| B02 | widerspreche | Der Code baut ein UPDATE mit beabsichtigtem Kunden- und Mandantenfilter. Wegen ungeprüfter Texteinbettung sind diese Filter für beliebige Eingaben nicht garantiert. Bei nicht manipulierten, passend formatierten Werten wird versucht, passende Zeilen zu ändern; ein Treffer ist nicht garantiert. | 11–15 plus 2–3,7 |
| B03 | stimme nur im DB-Scope zu | Bei abgefangener SQL-Ausnahme wird die aktuelle Standardverbindung zurückgerollt und DB_ERROR ausgegeben. Daraus folgt keine Aussage über beliebige vorausgegangene, bereits abgeschlossene LUWs. | 16–19 |
| B04 | stimme mit Präzisierung zu | Bei null gemeldeten Zeilen folgt Rollback; sonst erfolgt COMMIT WORK und die Statusausgabe. Der Code prüft nicht auf genau eine betroffene Zeile und belegt keine Einhaltung des beabsichtigten Mandantenscopes. | 21–27 |

### 5. Prozessskelett

Der Ablauf mit Schlüsselguard, SQL-Aufbau, DB-Aufruf, abgefangener SQL-Ausnahme, Nullzeilenguard und Commit ist im Normalfluss nachvollziehbar. Den Schreibknoten als „Native SQL ausführen; Ziel KNA1, effektiver Zeilenscope eingabeabhängig“ formulieren. Keine garantierte Ein-Kunden-Aktivität. Der CATCH-Knoten ist Fehlerkante des TRY-Bereichs, keine nach jedem Call zusätzlich ausgeführte technische Prüfung.

### 6. Sicherheit / Berechtigung

Konkreter Injektionspfad im gelieferten Textaufbau. Ein im isolierten SQLite-Modell getesteter Eingabewert innerhalb der p_name-Länge beseitigt den angehängten WHERE-Filter. Dies ist ein SQL-Gegenmodell, kein HANA-Exploitlauf. Zusätzlich fehlt im sichtbaren Slice ein Berechtigungsnachweis; das belegt nicht das Fehlen jeder Start-/Systemberechtigung.

### 7. Antworten auf Prüferfragen und offene Nachweise

#### Standardverbindung und COMMIT/ROLLBACK?

Unter der festgelegten Standardverbindung teilen sich Native SQL und ABAP SQL die Datenbanktransaktion; COMMIT WORK/ROLLBACK WORK sind relevante Grenzen. Sekundäre Verbindungen wären ein gesonderter Fall. [S05,S08,S10,S11]

#### CL_SQL_STATEMENT freigegeben?

Keine konkrete aktuelle Objektfreigabe bestätigt; die gezielte Katalogsuche ist kein Abwesenheitsbeweis. D bleibt wegen des belegten SAP-Updates entscheidbar.

#### Anker 15 oder 11?

Beide mit verschiedenen Rollen: Konsument primär für Effekt; Eingabefluss/Textaufbau primär für Injektionsbefund. Codeanker im SQL-String sekundär. Eine durchgehende ID verbindet beides.

#### Injektion eigener Befund?

Ja. Ein gebundener Platzhalter wäre ein Gegenfall; frei eingebaute Daten und gebundene Parameter nicht unter derselben Taint-Regel ablehnen. [S10]

#### Ohne System offen?

HANA-spezifische Syntax/Exceptions, tatsächliche Datenmenge, Objektmetadaten. Die fehlende garantierte Mandantenbegrenzung folgt bereits aus der unsicheren Konstruktion.

### 8. Praxisbezug und Freigabe

Nicht aus eigener Produktionsverantwortung belegt. Das Muster ist als konstruiertes Prüfbeispiel plausibel; keine Häufigkeitsschätzung und keine behauptete Kundenerfahrung.

**Reviewstatus:** Stellungnahme zu Quelle und Sollantwort; **kein** Status `architekt`, keine Vollfreigabe des Falls. Ein fachlich bestätigter Teilbefund darf getrennt erfasst werden, nicht in eine Gesamtabnahme hochstufen.

### 9. Gelieferte Quellen — unverändert extrahiert

#### `source.abap`

```abap
REPORT zcc_ref_034.
PARAMETERS p_kunnr TYPE c LENGTH 10.
PARAMETERS p_name TYPE c LENGTH 35 LOWER CASE.
DATA lv_sql TYPE string.
DATA lv_rows TYPE i.
START-OF-SELECTION.
  IF p_kunnr IS INITIAL.
    WRITE / 'NO_KEY'.
    RETURN.
  ENDIF.
  lv_sql = |UPDATE KNA1 SET NAME1 = '{ p_name }' | &&
           |WHERE MANDT = '{ sy-mandt }' AND KUNNR = '{ p_kunnr }'|.
  TRY.
      DATA(lo_stmt) = NEW cl_sql_statement( ).
      lv_rows = lo_stmt->execute_update( lv_sql ).
    CATCH cx_sql_exception.
      ROLLBACK WORK.
      WRITE / 'DB_ERROR'.
      RETURN.
  ENDTRY.
  IF lv_rows = 0.
    ROLLBACK WORK.
    WRITE / 'NO_UPDATE'.
    RETURN.
  ENDIF.
  COMMIT WORK.
  WRITE / 'UPDATE_COMMITTED'.
```

---

## CC-035 — EXEC SQL: Native SQL schreibt KNA1, kein Nachfolger, nicht in der Cloud

**Urteil:** D und Bindungsunterscheidung bestätigt; Wirkung und Nachfolgerstatus begrenzen.

**Original:** `referenzkorpus-v2.md`, ab Zeile 5686. **Zielprofil gelesen:** ja. **Modus:** nicht blind. **Native Ausführung:** nicht erfolgt.

### 1. Level und Bewertungsumfang

| Feld | Reviewantwort | Sicherheit |
|---|---|---|
| `classic_extension.level` | D | sicher; Bedingungen siehe Begründung |
| `known_worst_level` | D | sicher; Bedingungen siehe Begründung |
| `cloud_api_surface` | not_usable | sicher; Bedingungen siehe Begründung |
| `cloud_artefact` | not_activatable | sicher; Bedingungen siehe Begründung |

Direktes nicht unterstütztes Native-SQL-UPDATE auf KNA1 bleibt D. Gebundene Hostvariablen :p_name, :p_kunnr und :lv_mandt sind keine Konkatenation von SQL-Syntax. Das ist der erforderliche Gegenfall zum Injektionspfad in CC-034. Der REPORT plus EXEC-SQL-Technik ist kein geliefertes Cloud-Artefakt. [S01,S11]

### 2. Erwartete Befunde

Schweregrade sind Reviewprioritäten, keine SAP-ATC-Nummern.

| Statementbeginn | Konstrukt / Regel | Schwere | Reviewbefund |
|---|---|---|---|
| 11 | Native-SQL-Konsument / R13b | hoch | EXEC SQL verarbeitet den DB-spezifischen SQL-Block; Ziel KNA1 an 12 als Sekundäranker. |
| 11 | Direktes Schreiben / R02 | hoch | KNA1-Schreiben ist im angegebenen Scope D. |
| 15 | Transaktionsabschluss / R25 | mittel | COMMIT ohne vorherige Auswertung, ob tatsächlich ein Datensatz geändert wurde. |
| 16 | Erfolgsbehauptung / R18 | mittel | UPDATE_COMMITTED kann auch nach null betroffenen Zeilen erscheinen; kein Gateway erfinden, den der Code nicht enthält. |

### 3. SAP-Objekte und Nachfolger

| Objekt | Typisierte Identität | Nachfolger / Begründung | Drop-in |
|---|---|---|---|
| KNA1 | TABL/KNA1; TABL/KNA1 | DDLS/I_CUSTOMER; CDS_STOB/I_CUSTOMER [S19] | nein für UPDATE |
| EXEC SQL | ABAP-Sprachkonstrukt, kein erfundenes TADIR-Objekt | Kein nachgewiesener 1:1-Nachfolger des Statements; geeignete fachliche API gesondert bestimmen | nicht anwendbar |

### 4. Fachsätze — Vergleich mit dem vorgelegten Soll

| Satz | Vergleichsurteil | Präzise Reviewfassung | Quellanker |
|---|---|---|---|
| B01 | stimme zu | Bei initialem Namen wird vor dem DB-Aufruf abgebrochen. | 6–9 |
| B02 | enger formulieren | Es wird versucht, NAME1 für Zeilen mit den gebundenen Mandanten-/Kundenschlüsseln zu ändern. Der Code garantiert weder einen passenden Kunden noch eine positive Trefferzahl. | 10–14 |
| B03 | stimme zu | Nach normalem Abschluss von ENDEXEC folgt ohne Trefferprüfung COMMIT WORK und die Ausgabe UPDATE_COMMITTED; bei nicht abgefangenem Fehler wird dieser Normalpfad nicht erreicht. | 11–16 |

### 5. Prozessskelett

start:5 → name_guard:6 → early_return:8 oder client_value:10 → native_write_attempt:11 → commit:15 → output:16. Der Nulltreffer-Fall hat denselben sichtbaren Normalpfad. Eine Fehler-/Trefferabfrage wäre eine empfohlene Änderung, nicht Bestandteil des As-is-Skeletts. Nicht abgefangene native Fehler liegen außerhalb des erklärten Normalflussscope.

### 6. Sicherheit / Berechtigung

Kein SQL-Textinjektionsbefund allein aus den gebundenen Werten. Native SQL besitzt keine automatische Mandantenbehandlung; der konkrete Block enthält einen expliziten MANDT-Vergleich. Das ist weder ein vollständiger Berechtigungsnachweis noch ein pauschal mandantenübergreifender Zugriff. [S11]

### 7. Antworten auf Prüferfragen und offene Nachweise

#### sy-subrc/sy-dbcnt?

ENDEXEC setzt sy-subrc und sy-dbcnt. Die gelesene SAP-Dokumentation beschreibt sy-dbcnt als Zahl der im letzten Native-SQL-Statement verarbeiteten Zeilen; ein normal abgeschlossenes Update ohne Treffer hat damit keinen Nachweis einer geänderten Kundenzeile. Aus der allgemeinen 0/4-Tabelle allein leite ich keinen universellen sy-subrc-Wert für jedes DB-spezifische Nulltreffer-UPDATE ab; der genaue Zielsystemwert wurde nicht ausgeführt. Der Code wertet keines der Felder aus. Ein neues Gateway wäre ein Änderungsauftrag, nicht Bestandteil des As-is-Skeletts. [S11]

#### K13 oder K08?

K13 als Native-SQL-Mechanismus ist die präzisere interne Taxonomie. Eine Klassennummer ist Korpuskonvention, kein SAP-Urteil.

#### Hostvariablen ohne Injektion?

Ja für die hier gezeigte Bindung. Datenfehler, Berechtigungen oder problematische UPDATE-Semantik werden dadurch nicht beseitigt. [S11]

#### Kein Nachfolger?

„Kein 1:1-Schreibersatz in der beobachteten Katalogbeziehung“ ist gedeckt. „Es existiert keine geeignete fachliche Schreib-API“ wurde nicht belegt.

#### Zweitprofil?

Nichtaktivierbarkeit separat vom technischen Urteil über den Legacy-Quellstand ausweisen. Ein targetbezogenes n/a muss explizit im Schema definiert sein.

### 8. Praxisbezug und Freigabe

Nicht aus eigener Produktionsverantwortung belegt. Das Muster ist als konstruiertes Prüfbeispiel plausibel; keine Häufigkeitsschätzung und keine behauptete Kundenerfahrung.

**Reviewstatus:** Stellungnahme zu Quelle und Sollantwort; **kein** Status `architekt`, keine Vollfreigabe des Falls. Ein fachlich bestätigter Teilbefund darf getrennt erfasst werden, nicht in eine Gesamtabnahme hochstufen.

### 9. Gelieferte Quellen — unverändert extrahiert

#### `source.abap`

```abap
REPORT zcc_ref_035.
PARAMETERS p_kunnr TYPE c LENGTH 10.
PARAMETERS p_name TYPE c LENGTH 35 LOWER CASE.
DATA lv_mandt TYPE c LENGTH 3.
START-OF-SELECTION.
  IF p_name IS INITIAL.
    WRITE / 'NO_NAME'.
    RETURN.
  ENDIF.
  lv_mandt = sy-mandt.
  EXEC SQL.
    UPDATE KNA1 SET NAME1 = :p_name
      WHERE MANDT = :lv_mandt AND KUNNR = :p_kunnr
  ENDEXEC.
  COMMIT WORK.
  WRITE / 'UPDATE_COMMITTED'.
```

---

## CC-026 — Verbuchung: registriert an der Aufrufstelle, ausgeführt beim COMMIT, verworfen beim ROLLBACK

**Urteil:** Kernurteil stimmt; Ausführungsmodus und Erfolgsaussagen enger fassen.

**Original:** `referenzkorpus-v2.md`, ab Zeile 4218. **Zielprofil gelesen:** ja. **Modus:** nicht blind. **Native Ausführung:** nicht erfolgt.

### 1. Level und Bewertungsumfang

| Feld | Reviewantwort | Sicherheit |
|---|---|---|
| `classic_extension.level` | Unknown | wahrscheinlich; Bedingungen siehe Begründung |
| `known_worst_level` | B, nur sichtbarer Teil | wahrscheinlich; Bedingungen siehe Begründung |
| `cloud_api_surface` | unknown | wahrscheinlich; Bedingungen siehe Begründung |
| `cloud_artefact` | not_activatable | sicher; Bedingungen siehe Begründung |

Die fehlende Implementierung von Z_CC_DECISION_UPD verhindert ein vollständiges technisches Level. B als bekannte sichtbare Standard-ABAP-Mechanik ist eine begrenzte Untergrenze, keine Freigabe der Gesamtwirkung. Der REPORT kann unabhängig vom nicht aufgelösten Baustein nicht als dieses Artefakt in ABAP for Cloud aktiviert werden. Der Kontext muss die nicht lokale Verbuchung ausdrücklich festlegen; V1/V2 und SET UPDATE TASK LOCAL sind keine aus der CALL-Zeile ablesbaren Attribute. [S01, S05, S09]

### 2. Erwartete Befunde

Schweregrade sind Reviewprioritäten, keine SAP-ATC-Nummern.

| Statementbeginn | Konstrukt / Regel | Schwere | Reviewbefund |
|---|---|---|---|
| 6 | Registrierung / R25 | hoch | Baustein registriert; Implementierung fehlt. Noch keine Ausführung des Funktionsbausteins. |
| 12 | ROLLBACK WORK / R25 | mittel | Registrierte Update-Aufrufe dieser SAP-LUW verwerfen; nur den modellierten Abbruchzweig behaupten. |
| 15 | COMMIT WORK / R25 | hoch | Verbuchung anstoßen; ohne AND WAIT keine Erfolgssynchronisation. Lokalen Modus nicht allein aus der Syntax ausschließen. |
| 16 | Fachsatz / R18 | niedrig | COMMITTED ist die Statusausgabe des Reports, kein Nachweis einer gesicherten Route. |

### 3. SAP-Objekte und Nachfolger

| Objekt | Typisierte Identität | Nachfolger / Begründung | Drop-in |
|---|---|---|---|
| Z_CC_DECISION_UPD | FUGR / unbekannte Gruppe; FUNC / Z_CC_DECISION_UPD | Kundeneigen; keine behauptete SAP-Nachfolgerliste | nicht beurteilt |

### 4. Fachsätze — Vergleich mit dem vorgelegten Soll

| Satz | Vergleichsurteil | Präzise Reviewfassung | Quellanker |
|---|---|---|---|
| B01 | stimme zu, präzisieren | Fall-ID und Route werden als Parameter eines registrierten Update-Aufrufs festgehalten; der Baustein wird an Zeile 6 noch nicht ausgeführt. | 6–9 |
| B02 | stimme nur unter Bedingung zu | Ohne Abbruchkennzeichen wird COMMIT WORK aufgerufen. Im stipulierten nicht lokalen Modus stößt dies die Verbuchung an; die folgende Ausgabe prüft keinen fachlichen Erfolg. | 11,15–16 |
| B03 | stimme zu | Mit Abbruchkennzeichen wird die Registrierung verworfen und DISCARDED ausgegeben. Im gelieferten Zweig wird der Baustein nicht ausgeführt. | 11–13 |
| B04 | enger formulieren | REGISTERED wird vor der Verzweigung ausgegeben und belegt nur das Erreichen dieser Stelle, nicht allgemeine Wirkungslosigkeit aller möglichen Laufzeitaktivitäten. | 6–17 |

### 5. Prozessskelett

start:5 → update_registration:6 → output:10 → gateway:11. Der Abbruchzweig führt zu rollback:12 → output:13. Der andere Zweig führt zu update_dispatch:15 und zur Caller-Fortsetzung output:16. Die opake Verbuchung ist eine separat begründete asynchrone Wirkung bei nicht lokalem Update, kein synchron bereits abgeschlossener Call an Zeile 6. Das ursprüngliche Diagramm ist unter dieser Modusannahme im Kern passend.

### 6. Sicherheit / Berechtigung

Keine spezifische Schwachstelle aus dem sichtbaren Code bewiesen. Fehlende FM-Quelle umfasst auch die darin möglichen Berechtigungsprüfungen. Ein fehlender sichtbarer Check ist nicht der Nachweis einer im Gesamtsystem fehlenden Kontrolle.

### 7. Antworten auf Prüferfragen und offene Nachweise

#### sy-subrc ohne AND WAIT?

Nach COMMIT WORK ohne AND WAIT ist sy-subrc kein Verbuchungserfolgsbeleg. Nicht nur fehlende Auswertung, sondern auch die Aussagekraft des Werts selbst erklären. [S09]

#### Fehler nur in SM13?

Zu absolut. Updateadministration/Protokolle sind relevant; SAP dokumentiert zusätzlich Benachrichtigungsmechanismen. Nicht „nur SM13“ als exklusiven Kanal behaupten. [S09]

#### V1/V2-Attribut?

Ändert Reihenfolge und Synchronisationsaussage. AND WAIT bezieht sich auf die synchrone hochprioritäre Verbuchung; nicht pauschal jedes nachgelagerte V2-Ergebnis als bereits geprüft ausgeben. [S05,S09]

#### Cloud?

Der gelieferte REPORT ist bereits ungeeignet. Für ein isoliertes aufrufendes Cloud-Objekt zusätzlich zulässiges Modell statt klassischer Update-Technik prüfen; das ist ein anderer Zielartefaktfall.

#### Ohne System offen?

FM-Attribute und -Quelltext, lokaler Update-Modus, konkrete Produktivfehlerbehandlung. Die statische Registrierungsaussage braucht dagegen keinen Systemlauf.

### 8. Praxisbezug und Freigabe

Nicht aus eigener Produktionsverantwortung belegt. Das Muster ist als konstruiertes Prüfbeispiel plausibel; keine Häufigkeitsschätzung und keine behauptete Kundenerfahrung.

**Reviewstatus:** Stellungnahme zu Quelle und Sollantwort; **kein** Status `architekt`, keine Vollfreigabe des Falls. Ein fachlich bestätigter Teilbefund darf getrennt erfasst werden, nicht in eine Gesamtabnahme hochstufen.

### 9. Gelieferte Quellen — unverändert extrahiert

#### `source.abap`

```abap
REPORT zcc_ref_026.
PARAMETERS p_id TYPE c LENGTH 10.
PARAMETERS p_route TYPE c LENGTH 20.
PARAMETERS p_abort AS CHECKBOX.
START-OF-SELECTION.
  CALL FUNCTION 'Z_CC_DECISION_UPD'
    IN UPDATE TASK
    EXPORTING iv_case_id = p_id
              iv_route   = p_route.
  WRITE / 'REGISTERED'.
  IF p_abort = 'X'.
    ROLLBACK WORK.
    WRITE / 'DISCARDED'.
  ELSE.
    COMMIT WORK.
    WRITE / 'COMMITTED'.
  ENDIF.
```

---

## CC-027 — Verbuchung ohne COMMIT WORK: angekündigt, nicht persistiert (Negativkontrolle zu CC-026)

**Urteil:** Im Slice keine Ausführung belegt; Reportende-/SUBMIT-Erklärung korrigieren.

**Original:** `referenzkorpus-v2.md`, ab Zeile 4372. **Zielprofil gelesen:** ja. **Modus:** nicht blind. **Native Ausführung:** nicht erfolgt.

### 1. Level und Bewertungsumfang

| Feld | Reviewantwort | Sicherheit |
|---|---|---|
| `classic_extension.level` | Unknown | wahrscheinlich; Bedingungen siehe Begründung |
| `known_worst_level` | B, nur sichtbarer Teil | wahrscheinlich; Bedingungen siehe Begründung |
| `cloud_api_surface` | unknown | wahrscheinlich; Bedingungen siehe Begründung |
| `cloud_artefact` | not_activatable | sicher; Bedingungen siehe Begründung |

Das fehlende COMMIT WORK rechtfertigt die Aussage, dass dieser Report keinen expliziten Update-Anstoß enthält. Es rechtfertigt keine Gleichsetzung von Registrieren, Nichtausführen und Löschen der Registrierungsdaten. Ein normaler Datenbank-Commit startet nicht automatisch die Update-Verarbeitung. [S05,S07,S09]

### 2. Erwartete Befunde

Schweregrade sind Reviewprioritäten, keine SAP-ATC-Nummern.

| Statementbeginn | Konstrukt / Regel | Schwere | Reviewbefund |
|---|---|---|---|
| 5 | Registrierung / R25 | hoch | Nur Registrierung; Quelltext und Eigenschaften des Update-Funktionsbausteins fehlen. |
| 9 | Status / R18 | niedrig | REGISTERED ist keine Persistenzbestätigung. |
| 10 | Scopeabschluss / R25 | mittel | Keine Update-Ausführung aus dem Reportende ergänzen. Lebenszyklus der Registrierung nicht mit ROLLBACK gleichsetzen. |

### 3. SAP-Objekte und Nachfolger

| Objekt | Typisierte Identität | Nachfolger / Begründung | Drop-in |
|---|---|---|---|
| Z_CC_DECISION_UPD | FUGR / unbekannte Gruppe; FUNC / Z_CC_DECISION_UPD | kundeneigen, Nachfolger nicht anwendbar | nicht beurteilt |

### 4. Fachsätze — Vergleich mit dem vorgelegten Soll

| Satz | Vergleichsurteil | Präzise Reviewfassung | Quellanker |
|---|---|---|---|
| B01 | stimme zu | Der Report registriert den Baustein mit ID und Route. | 5–8 |
| B02 | stimme nur in enger Fassung zu | Im gelieferten Ablauf wird kein COMMIT WORK ausgeführt; eine fachliche Datenänderung durch den registrierten Baustein ist nicht belegt. REGISTERED und END_OF_REPORT sind Ausgaben. | 5–10 |

### 5. Prozessskelett

start:4 → update_registration:5 → output:9 → output:10. Kein erfundener Verbuchungs-Dispatch im prozeduralen Slice. Ergänzend darf ein außerhalb der Scheibe liegender Session-/LUW-Lebenszyklus als Kontext notiert werden, nicht als ausgeführter fachlicher Schreibknoten.

### 6. Sicherheit / Berechtigung

Kein eigenständiger konkreter Sicherheitsbefund. Einen fachlichen Fehler „fehlendes COMMIT“ erst nach Klärung der vorgesehenen Transaktionsverantwortung zuschreiben.

### 7. Antworten auf Prüferfragen und offene Nachweise

#### Wird am Reportende alles verworfen?

So nicht bestätigen. SAP beschreibt das Ende einer internen Sitzung ohne expliziten SAP-LUW-Abschluss anders als ROLLBACK: Registrierungen können als nicht mehr ausführbare Einträge bestehen bleiben. Keine fachliche Ausführung; aber „gelöscht/verworfen“ ist nicht generell bewiesen. [S07,S09]

#### SUBMIT … AND RETURN gemeinsam mit Caller-LUW?

Die pauschale gemeinsame SAP-LUW ist falsch. Die aufgerufene interne Sitzung hat eine eigene SAP-LUW. Ein späteres Caller-COMMIT darf nicht ohne weiteren Beleg als Dispatcher dieses Reports eingezeichnet werden. Nicht mit externem FORM/normalem Funktionsaufruf verwechseln. [S07]

#### Anker/Negativpfad?

B02 braucht den vollständigen gelieferten Slice als Vollständigkeitsbeleg für das Fehlen eines COMMIT, nicht nur Zeile 10.

#### Ohne System offen?

Konkreter Start-/Rückkehrkontext, Update-Verwaltungsdaten im Zielsystem und erwartete fachliche Commit-Verantwortung. Keine allgemeine Laufzeitfreigabe.

### 8. Praxisbezug und Freigabe

Nicht aus eigener Produktionsverantwortung belegt. Das Muster ist als konstruiertes Prüfbeispiel plausibel; keine Häufigkeitsschätzung und keine behauptete Kundenerfahrung.

**Reviewstatus:** Stellungnahme zu Quelle und Sollantwort; **kein** Status `architekt`, keine Vollfreigabe des Falls. Ein fachlich bestätigter Teilbefund darf getrennt erfasst werden, nicht in eine Gesamtabnahme hochstufen.

### 9. Gelieferte Quellen — unverändert extrahiert

#### `source.abap`

```abap
REPORT zcc_ref_027.
PARAMETERS p_id TYPE c LENGTH 10.
PARAMETERS p_route TYPE c LENGTH 20.
START-OF-SELECTION.
  CALL FUNCTION 'Z_CC_DECISION_UPD'
    IN UPDATE TASK
    EXPORTING iv_case_id = p_id
              iv_route   = p_route.
  WRITE / 'REGISTERED'.
  WRITE / 'END_OF_REPORT'.
```

---

## CC-038 — Dynamisches Schreibziel: MODIFY (p_tab) — Unknown, schlimmster Fall D, plus Sicherheitsbefund

**Urteil:** Gesamt-Unknown richtig; known_worst=D und Cloud-Zweitantwort widersprochen.

**Original:** `referenzkorpus-v2.md`, ab Zeile 6166. **Zielprofil gelesen:** ja. **Modus:** nicht blind. **Native Ausführung:** nicht erfolgt.

### 1. Level und Bewertungsumfang

| Feld | Reviewantwort | Sicherheit |
|---|---|---|
| `classic_extension.level` | Unknown | wahrscheinlich; Bedingungen siehe Begründung |
| `known_worst_level` | B für sichtbare eigene/Standard-Mechanik; unbekannte Ziele separat, nicht D als bekannt | wahrscheinlich; Bedingungen siehe Begründung |
| `cloud_api_surface` | unknown | wahrscheinlich; Bedingungen siehe Begründung |
| `cloud_artefact` | not_activatable | sicher; Bedingungen siehe Begründung |

Die Eingabe p_tab ist nicht durch die Vorbelegung auf ZCC_LOG_A beschränkt. Ein mögliches unzulässiges Ziel ist kein bekanntes Ziel. Deshalb ist Unknown für die Gesamtbewertung richtig, D als known_worst dagegen ein Kategorienfehler. Eine optionale Risikogrenze darf potential_worst_level heißen, muss aber die tatsächlich mögliche Zielmenge/Strukturverträglichkeit beachten. Das gelieferte REPORT-Artefakt ist im Cloud-Zweitprofil unabhängig vom dynamischen MODIFY nicht aktivierbar. [S01,S02]

### 2. Erwartete Befunde

Schweregrade sind Reviewprioritäten, keine SAP-ATC-Nummern.

| Statementbeginn | Konstrukt / Regel | Schwere | Reviewbefund |
|---|---|---|---|
| 2 | Dynamische Eingabe / R07 | mittel | Default ist keine Allowlist, keine Zielmengenbegrenzung. |
| 14 | Unaufgelöstes DML-Ziel / R26 | hoch | MODIFY trifft ein erst zur Laufzeit bestimmtes Ziel; bekannte und hypothetische Level getrennt ausweisen. |
| 14 | Generischer Schreibzugriff / R28 | hoch | Keine sichtbare Allowlist oder fallbezogene Berechtigungsprüfung; keine konkrete erfolgreiche Schreibmöglichkeit auf jede SAP-Tabelle behaupten. |
| 16 | Commit / R25 | mittel | Persistenz erfolgt im normalen erfolgreichen Pfad; Laufzeitausnahmen bei Ziel-/Strukturproblemen bleiben möglich. |

### 3. SAP-Objekte und Nachfolger

| Objekt | Typisierte Identität | Nachfolger / Begründung | Drop-in |
|---|---|---|---|
| ZCC_LOG_A | TABL/ZCC_LOG_A; TABL/ZCC_LOG_A | kundeneigene Defaulttabelle, nicht erschöpfende Zielmenge | nicht anwendbar |
| ZCC_LOG_ROW | TABL/ZCC_LOG_ROW; TABL/ZCC_LOG_ROW | kundeneigene DDIC-Struktur im Kontext, keine Tabelle allein aus Namen ableiten | nicht anwendbar |
| dynamisches Ziel p_tab | Unresolved target, kein erfundener Objektname | unknown; erst nach Zielmengenklärung | nicht bestimmt |

### 4. Fachsätze — Vergleich mit dem vorgelegten Soll

| Satz | Vergleichsurteil | Präzise Reviewfassung | Quellanker |
|---|---|---|---|
| B01 | stimme zu | Bei initialem Schlüssel wird vor der Datenbankoperation abgebrochen. | 7–10 |
| B02 | stimme nur bedingt zu | Der Code füllt eine Arbeitsstruktur und versucht einen Insert-/Update-artigen MODIFY auf die benannte Tabelle. Erfolg und tatsächlicher Zeilenscope hängen vom existierenden, kompatiblen Ziel ab. | 11–14 |
| B03 | stimme im Normalfluss zu | Bei normalem MODIFY-Abschluss und sy-subrc 0 wird committet, sonst zurückgerollt. Nicht abgefangene Ausnahmen erreichen möglicherweise keinen dieser Zweige. | 14–21 |

### 5. Prozessskelett

Das Skelett darf einen write_attempt mit target_resolution=unknown enthalten. Ein unbekanntes Ziel macht den Kontrollfluss nicht leer. Ein nicht modellierter Ausnahmeabgang muss als Scopegrenze erhalten bleiben; SAVED ist der Programmtext nach COMMIT, nicht Beleg für einen fachlich zulässigen Datensatz.

### 6. Sicherheit / Berechtigung

Befund ohne erfundenes S_TABU_-Objekt ist tragfähig: fehlender sichtbarer Nachweis für autorisierten generischen Schreibscope. Ob S_TABU_NAM, S_TABU_DIS oder eine fachliche Kontrolle erforderlich ist, hängt von Anwendung und Konzept ab. Statische Beobachtung ist keine vollständige Sicherheitsanalyse.

### 7. Antworten auf Prüferfragen und offene Nachweise

#### Ist Default Grund für B?

Nein. B kann nur den bereits bekannten sichtbaren Teil beschreiben, nicht den Gesamtscope.

#### Welche known_worst-Antwort?

B für die deklarierte bekannte Standard-/Eigenobjektmechanik mit offenem Rest oder null bei rein objektbezogener Aggregation. D allenfalls explizit als hypothetische Risikogrenze, nicht known. Die neue Konvention muss einheitlich dokumentiert werden.

#### DELETE-Variante?

Eigener Gegenfall sinnvoll, da andere Wirkung, andere Zeilen-/Ergebnissemantik und andere Strukturvoraussetzungen. MODIFY deckt nicht alle DML-Arten ab.

#### Cloud-Zweitprofil?

REPORT verhindert Aktivierung. Die Behauptung „weiter nur Unknown“ verwechselt Auflösbarkeit der Operation mit Aktivierbarkeit des gelieferten Artefakts.

#### Ohne System offen?

Erlaubte/erreichbare Zielmenge, DDIC-Strukturverträglichkeit, Tabellenschutz, konkrete Berechtigungsarchitektur. Kein Nachfolgername kann diese Unbekannten ersetzen.

### 8. Praxisbezug und Freigabe

Nicht aus eigener Produktionsverantwortung belegt. Das Muster ist als konstruiertes Prüfbeispiel plausibel; keine Häufigkeitsschätzung und keine behauptete Kundenerfahrung.

**Reviewstatus:** Stellungnahme zu Quelle und Sollantwort; **kein** Status `architekt`, keine Vollfreigabe des Falls. Ein fachlich bestätigter Teilbefund darf getrennt erfasst werden, nicht in eine Gesamtabnahme hochstufen.

### 9. Gelieferte Quellen — unverändert extrahiert

#### `source.abap`

```abap
REPORT zcc_ref_038.
PARAMETERS p_tab TYPE c LENGTH 30 DEFAULT 'ZCC_LOG_A'.
PARAMETERS p_key TYPE c LENGTH 10.
PARAMETERS p_text TYPE c LENGTH 40 LOWER CASE.
DATA ls_row TYPE zcc_log_row.
START-OF-SELECTION.
  IF p_key IS INITIAL.
    WRITE / 'NO_KEY'.
    RETURN.
  ENDIF.
  ls_row-mandt = sy-mandt.
  ls_row-log_key = p_key.
  ls_row-log_text = p_text.
  MODIFY (p_tab) FROM @ls_row.
  IF sy-subrc = 0.
    COMMIT WORK.
    WRITE / 'SAVED'.
  ELSE.
    ROLLBACK WORK.
    WRITE / 'NOT_SAVED'.
  ENDIF.
```

---

## CC-053 — Userexit-Include MV45AFZZ: der Hostkontext steht im Code, nicht im Fixture

**Urteil:** Pauschales D und vermeintlich quelltextbewiesener Host zurückweisen.

**Original:** `referenzkorpus-v2.md`, ab Zeile 8527. **Zielprofil gelesen:** ja. **Modus:** nicht blind. **Native Ausführung:** nicht erfolgt.

### 1. Level und Bewertungsumfang

| Feld | Reviewantwort | Sicherheit |
|---|---|---|
| `classic_extension.level` | Unknown bis Host-/Technologiemetadaten geklärt | wahrscheinlich; Bedingungen siehe Begründung |
| `known_worst_level` | nicht abschließend festgelegt; kein belegtes D | wahrscheinlich; Bedingungen siehe Begründung |
| `cloud_api_surface` | not_usable unter stipuliertem klassischem SAP-Host, sonst unknown | wahrscheinlich; Bedingungen siehe Begründung |
| `cloud_artefact` | not_activatable als isoliertes geliefertes Includefragment | sicher; Bedingungen siehe Begründung |

Der Code enthält weder den Include-Namen MV45AFZZ noch einen beweisenden Modifikationsnachweis. Repositoryidentität ist externe Metadateninformation, auch wenn sie im Dateimanifest steht. FORM-Name und undeclarierte globale Struktur sind Hinweise. SAPs allgemeine Leveldefinition lässt nominierte klassische Userexits/BAdIs unter B zu. Eine echte Modifikation oder implizite SAP-Erweiterung wäre D; eine fehlende Freigabe kann C/Unknown erfordern. Der konkrete MV45AFZZ-Eintrag samt Kontext ist hier nicht abschließend bestätigt. Daher kein blindes Umdrehen von D nach B. [S01,S20,S25]

### 2. Erwartete Befunde

Schweregrade sind Reviewprioritäten, keine SAP-ATC-Nummern.

| Statementbeginn | Konstrukt / Regel | Schwere | Reviewbefund |
|---|---|---|---|
| 1 | Host-Bindung / R32 | hoch | FORM-Konvention erkennen, aber Host und Repositoryobjekt nicht aus Bytes beweisen. Korpus verbietet zu Unrecht Unknown bei fehlenden Metadaten. |
| 4 | Globale Arbeitsstruktur / R29 | mittel | AUART und NETWR werden aus vbak gelesen; Typ und Währung hängen am Host-/DDIC-Kontext. |
| 8 | Speicherzuweisung / R19 | niedrig | LIFSK in Arbeitsstruktur setzen, kein Datenbank-UPDATE und kein Persistenznachweis. |
| 1 | Erweiterungsmechanismus / R10/R32 | hoch | Mechanismus nachweisen, bevor D für eine Modifikation/implizite Änderung vergeben wird. |

### 3. SAP-Objekte und Nachfolger

| Objekt | Typisierte Identität | Nachfolger / Begründung | Drop-in |
|---|---|---|---|
| MV45AFZZ | PROG/MV45AFZZ; INCL/MV45AFZZ nur nach bestätigtem Repositorymanifest | Migrations-/Erweiterungsalternative kontextabhängig; kein belegter 1:1-Nachfolger | offen |
| vbak | Sichtbar zunächst Hostvariable/Struktur; TABL/VBAK als DDIC-Bindung nur mit Deklarations-/Hostnachweis | Lesenachfolger wäre kein Ersatz für eine änderbare Hostarbeitsstruktur | nein als allgemeiner Ersatz |

### 4. Fachsätze — Vergleich mit dem vorgelegten Soll

| Satz | Vergleichsurteil | Präzise Reviewfassung | Quellanker |
|---|---|---|---|
| B01 | stimme zu mit Kontext | Wenn die gelieferte Arbeitsstruktur AUART=TA und NETWR>20000 enthält, wird lokal der Kandidat 01 gesetzt. Währung und Bedeutung des Sperrcodes sind nicht im Code bewiesen. | 3–6 |
| B02 | stimme teilweise zu | Bei nicht initialem Kandidaten wird vbak-lifsk gesetzt. Andernfalls bleibt ein bereits vorhandener LIFSK-Wert unverändert. Dass der Host diese Änderung später tatsächlich speichert, ist aus dem Ausschnitt nicht ableitbar. | 7–9 |

### 5. Prozessskelett

start:FORM1 unter unbekanntem/extern belegtem Aufrufer → CLEAR lokaler Kandidat:3 → Prädikat:4 → ggf. Kandidat setzen:5 → Kandidatprüfung:7 → ggf. Arbeitsstruktur ändern:8 → Rückkehr:10. Den Start nicht ohne Bindungsbeleg als „SAP-Host beim Sichern“ etikettieren. Der Kontrollfluss im FORM ist dagegen entscheidbar. Bestehende Liefersperre auf dem negativen Pfad bleibt bestehen.

### 6. Sicherheit / Berechtigung

Kein Datenbank-Write-Befund R02. Kein Berechtigungsfehler allein aus fehlendem Check im Exitfragment: Hostkontrollen können außerhalb liegen. Die unveränderte vorhandene Sperre im negativen Zweig ist ein fachlich relevanter Zustand, kein pauschaler Defekt.

### 7. Antworten auf Prüferfragen und offene Nachweise

#### D, C oder B?

Keine universelle D-Regel für Userexits. SAP listet klassische nominierte Erweiterungspunkte in B; tatsächliche Modifikation/implizite Änderung ist D. Für dieses konkrete Include braucht es belastbaren Mechanismus-/Nominationkontext. [S01]

#### Genügt FORM-Name?

Nein. Derselbe Text kann in einem kundeneigenen Include stehen. Auch eine undeclarierte globale Variable wird nicht dadurch zur SAP-Tabelle.

#### Darf Dateimetadatum verwendet werden?

Ja, aber explizit als Kontextbeleg mit Hash/Provenienz. „Kein Fixture nötig“ darf nicht „Metadaten sind plötzlich Syntax“ bedeuten.

#### Gibt es einen zusätzlichen MV45AFZZ-Hinweis?

Ein SAP-Community-Beitrag nennt MV45AFZZ als mögliches Level-B-Beispiel und verweist auf Note 3578329. Die Note war nicht lesbar. Das stärkt den Einwand gegen pauschales D, ersetzt aber keinen spezifischen System-/Releasebeleg. [S25]

#### Kommt es so produktiv vor?

Klassische Exitformen sind in SAP dokumentiert. Keine eigene Kundenerfahrung behauptet. Insbesondere die Feldänderung an diesem konkreten Exitzeitpunkt muss durch Hostimplementierung und fachliche Prüfung bestätigt werden.

### 8. Praxisbezug und Freigabe

Nicht aus eigener Produktionsverantwortung belegt. Das Muster ist als konstruiertes Prüfbeispiel plausibel; keine Häufigkeitsschätzung und keine behauptete Kundenerfahrung.

**Reviewstatus:** Stellungnahme zu Quelle und Sollantwort; **kein** Status `architekt`, keine Vollfreigabe des Falls. Ein fachlich bestätigter Teilbefund darf getrennt erfasst werden, nicht in eine Gesamtabnahme hochstufen.

### 9. Gelieferte Quellen — unverändert extrahiert

#### `source.abap`

```abap
FORM userexit_save_document.
  DATA lv_block TYPE c LENGTH 2.
  CLEAR lv_block.
  IF vbak-auart = 'TA' AND vbak-netwr > 20000.
    lv_block = '01'.
  ENDIF.
  IF lv_block IS NOT INITIAL.
    vbak-lifsk = lv_block.
  ENDIF.
ENDFORM.
```

---

## CC-057 — Profilpaar: SELECT FROM KNA1 in einer globalen Klasse — C mit Nachfolger oder nicht aktivierbar

**Urteil:** Profilabhängige Kernaussage bestätigt; Quell- und Zielbeurteilung trennen.

**Original:** `referenzkorpus-v2.md`, ab Zeile 9132. **Zielprofil gelesen:** ja. **Modus:** nicht blind. **Native Ausführung:** nicht erfolgt.

### 1. Level und Bewertungsumfang

| Feld | Reviewantwort | Sicherheit |
|---|---|---|
| `classic_extension.level` | Profil 1: C unter internem Fixture; Profil 2: nicht anwendbar für target-ausführbare Erweiterung | wahrscheinlich; Bedingungen siehe Begründung |
| `known_worst_level` | Profil 1: C; Profil 2: null für Targetlevel, Legacybefund weiter C | wahrscheinlich; Bedingungen siehe Begründung |
| `cloud_api_surface` | not_usable im angegebenen Zielkontext | wahrscheinlich; Bedingungen siehe Begründung |
| `cloud_artefact` | not_activatable als Cloud-Artefakt | sicher; Bedingungen siehe Begründung |

Profil 1 stipuliert die interne KNA1-Verwendung und trägt deshalb C. Profil 2 hat ein anderes Produkt/Release und eine andere Sprachversion; KNA1 ist kein zulässiges lokales S/4-Tabellenobjekt im BTP-Ziel. Das ist keine bloße Umklassifikation zu D. Die Legacyanalyse darf trotzdem erhalten bleiben. Ein explizites Feld assessment_applicable=false ist klarer als ein unerklärtes n/a im A–D/Unknown-Enum. [S01,S02,S19]

### 2. Erwartete Befunde

Schweregrade sind Reviewprioritäten, keine SAP-ATC-Nummern.

| Statementbeginn | Konstrukt / Regel | Schwere | Reviewbefund |
|---|---|---|---|
| 10 | Interner Lesezugriff / R01 | mittel | Statementbeginn 10, Tabellentoken +4; Sekundäranker 11. C unter angegebenem Legacyprofil. |
| 10 | Zielunverträglichkeit / R31 | hoch | KNA1 fehlt oder ist im konkreten Cloud-Ziel nicht verwendbar; Existenz und Freigabe als unterschiedliche Ursachen ausweisen. |
| 14 | Trefferguard / R19 | niedrig | Rückgabe wird nur bei SELECT-sy-subrc 0 gesetzt. Kein Treffernachweis allein aus dem Aufruf. |

### 3. SAP-Objekte und Nachfolger

| Objekt | Typisierte Identität | Nachfolger / Begründung | Drop-in |
|---|---|---|---|
| KNA1 | TABL/KNA1; TABL/KNA1 | DDLS/I_CUSTOMER; CDS_STOB/I_CUSTOMER im beobachteten PCE2022-Katalog | nicht bewiesen |
| I_CUSTOMER | Nachfolgerhinweis aus S/4-Metadaten; nicht automatisch lokales BTP-Objekt | Für BTP Datenquelle/Remotezugriff separat entwerfen | kein automatischer BTP-Ersatz |

### 4. Fachsätze — Vergleich mit dem vorgelegten Soll

| Satz | Vergleichsurteil | Präzise Reviewfassung | Quellanker |
|---|---|---|---|
| B01 | enger formulieren | Die Methode versucht für den exakt übergebenen Schlüssel einen Länderschlüssel zu lesen. Nur bei Treffer wird der gefundene Wert übernommen. | 10–15 |
| B02 | stimme zu | Ohne Treffer bleibt der Rückgabewert initial; der sichtbare Code erzeugt keine eigene Fehlermeldung. Nicht abgefangene DB-/Laufzeitfehler sind davon zu unterscheiden. | 14–17 |

### 5. Prozessskelett

Quelltextmodell: method_start:9 → read_attempt:10 → match:14 → ggf. assignment:15 → return:17. Dieses As-is-Modell muss für die Migration auch dann verfügbar bleiben, wenn das Zielartefakt nicht aktiviert werden kann. Nur ein ausdrücklich als Target-Ausführungsmodell benannter Graph ist im Profil 2 not_applicable. Die pauschale Abschaltung jedes Prozessskeletts würde gerade den Legacy-Erkenntniswert verlieren.

### 6. Sicherheit / Berechtigung

Kein eigener Sicherheitsbefund aus diesem Slice. Ein Wechsel zu CDS kann Berechtigungs-/Filtersemantik verändern; vorhandene DCL oder Gleichheit der Ergebnismengen nicht aus dem Nachfolgernamen ableiten.

### 7. Antworten auf Prüferfragen und offene Nachweise

#### Syntaxfehler oder ATC?

In ABAP for Cloud ist die Verwendbarkeit von Repositoryobjekten Teil der Sprach-/Zulassungsprüfung; bei fehlendem Objekt und nicht freigegebenem Objekt unterscheiden sich Ursachen. Der konkrete Meldungstext und -schlüssel im Zielrelease wurden nicht ausgeführt. [S02]

#### Tokenoffset?

+4 trifft KNA1 in SELECT SINGLE land1 FROM kna1. Die Konvention muss mit dem verwendeten Tokenizer fixiert werden.

#### n/a zulässig?

Nur nach expliziter Schemaerweiterung; sonst eigener Anwendbarkeitsstatus und null. Unknown ist epistemisch etwas anderes als nicht anwendbar.

#### Nur Sprache geändert?

Nein: hier auch Edition/Release/Katalogkontext. Als realistischer Profilvergleich zulässig, aber kein isolierter Ein-Faktor-Test.

#### Eingabeformat?

Generisches TYPE c führt nicht selbst ALPHA aus. Keine generelle Aussage „ohne Nullen kein Treffer“: alphanumerische Schlüssel benötigen nicht dieselbe Nullauffüllung. [S15]

### 8. Praxisbezug und Freigabe

Nicht aus eigener Produktionsverantwortung belegt. Das Muster ist als konstruiertes Prüfbeispiel plausibel; keine Häufigkeitsschätzung und keine behauptete Kundenerfahrung.

**Reviewstatus:** Stellungnahme zu Quelle und Sollantwort; **kein** Status `architekt`, keine Vollfreigabe des Falls. Ein fachlich bestätigter Teilbefund darf getrennt erfasst werden, nicht in eine Gesamtabnahme hochstufen.

### 9. Gelieferte Quellen — unverändert extrahiert

#### `source.abap`

```abap
CLASS zcl_cc_customer_country DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS get_country
      IMPORTING iv_kunnr        TYPE c
      RETURNING VALUE(rv_land1) TYPE string.
ENDCLASS.

CLASS zcl_cc_customer_country IMPLEMENTATION.
  METHOD get_country.
    SELECT SINGLE land1
      FROM kna1
      WHERE kunnr = @iv_kunnr
      INTO @DATA(lv_land1).
    IF sy-subrc = 0.
      rv_land1 = lv_land1.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
```

---

## CC-058 — Profilpaar: SELECT FROM I_CUSTOMER im klassischen REPORT — freigegebenes Lesen ist nicht C, der Report bleibt klassisch

**Urteil:** Released-Lesen bestätigt; Status-/Scopekonvention und Nachfolgerbegründung präzisieren.

**Original:** `referenzkorpus-v2.md`, ab Zeile 9302. **Zielprofil gelesen:** ja. **Modus:** nicht blind. **Native Ausführung:** nicht erfolgt.

### 1. Level und Bewertungsumfang

| Feld | Reviewantwort | Sicherheit |
|---|---|---|
| `classic_extension.level` | Profil 1: B; Profil 2: targetbezogen nicht anwendbar | wahrscheinlich; Bedingungen siehe Begründung |
| `known_worst_level` | Profil 1: B; Profil 2: null für Targetlevel | wahrscheinlich; Bedingungen siehe Begründung |
| `cloud_api_surface` | usable für beobachtetes I_CUSTOMER-Profil, vorbehaltlich konkretem Release-/Vertragsnachweis | wahrscheinlich; Bedingungen siehe Begründung |
| `cloud_artefact` | not_activatable: REPORT/Selektionsbild/Listausgabe | sicher; Bedingungen siehe Begründung |

Ein eigener I_CUSTOMER-Datensatz wurde in objectReleaseInfo_PCE2022.json gefunden: DDLS/I_CUSTOMER, CDS_STOB/I_CUSTOMER, state released. Damit ist die bisher nur erinnerte Objektfreigabe für diese gelesene Katalogansicht konkret gestützt. Der Datensatz ersetzt noch keinen unveränderlichen Snapshot für das tatsächliche 2023-Ziel und enthält in dieser Form nicht die vollständigen ADT-C1-/Sichtbarkeitsattribute. Der klassische Report wird durch den freigegebenen Read nicht zu einem aktivierbaren Cloud-Report. [S01,S02,S19]

### 2. Erwartete Befunde

Schweregrade sind Reviewprioritäten, keine SAP-ATC-Nummern.

| Statementbeginn | Konstrukt / Regel | Schwere | Reviewbefund |
|---|---|---|---|
| 4 | Released Read / R03 statt pauschal R01 | niedrig | I_CUSTOMER nicht allein wegen SAP-Namens oder Herkunft als internes C melden. |
| 1 | Artefakttyp / R31 | hoch | Cloud-Ziel: REPORT plus Selektionsbild/Listausgabe ist das Problem; keine ungerechtfertigte Abwertung der SELECT-API. |
| 9 | Leerpfad / R19 | niedrig | Leere Ergebnismenge führt zu NO_MATCH und RETURN; anschließende Schleife nur bei Treffern. |

### 3. SAP-Objekte und Nachfolger

| Objekt | Typisierte Identität | Nachfolger / Begründung | Drop-in |
|---|---|---|---|
| I_CUSTOMER | DDLS/I_CUSTOMER; CDS_STOB/I_CUSTOMER | Eigener state released beobachtet; eigener Nachfolger nicht erhoben, kein semantischer Status „weil selbst Nachfolger kann keiner folgen“ | Nein, Gleichheit mit KNA1 nicht bewiesen |

### 4. Fachsätze — Vergleich mit dem vorgelegten Soll

| Satz | Vergleichsurteil | Präzise Reviewfassung | Quellanker |
|---|---|---|---|
| B01 | stimme zu im Modellscope | Es wird nach dem eingegebenen Country-Wert selektiert. Native Gültigkeit der konkreten Felder und DCL des Zielreleases getrennt prüfen. | 4–8 |
| B02 | stimme zu | Bei initialer Ergebnistabelle wird NO_MATCH ausgegeben und der Block verlassen. | 9–12 |
| B03 | stimme zu | Sonst werden Customer und CustomerName der gelieferten Ergebnismenge ausgegeben. Identität mit der KNA1-Ergebnismenge ist nicht belegt. | 13–15 |

### 5. Prozessskelett

Reportstart:3 → CDS-read:4 → Leerprüfung:9 → no_match:10/return:11 oder iteration:13/output:14 → Ende. Für eine nachweisbezogene Legacydarstellung erhalten; Targetaktivierbarkeit daneben anzeigen. Das Modell ist kein Beweis einer tatsächlich im Ziel ausgeführten Liste.

### 6. Sicherheit / Berechtigung

DCL-/Berechtigungsumfang nicht aus dem Wort released erschließen. Die Abfrage enthält keinen WITH PRIVILEGED ACCESS. Gegenprobe mit/ohne passende Zugriffsrollen ist eine separate Zielsystemaufgabe, kein erfundener As-is-Befund.

### 7. Antworten auf Prüferfragen und offene Nachweise

#### Eigener released-Eintrag?

Ja, in der abgefragten PCE2022-Datei vorhanden (Zeilen 29313–29322 der Webansicht). Den vorher nur als Nachfolger belegten Status kann man für diesen Ausschnitt schließen. C1/Use-in-Cloud im exakten Zielsystem weiterhin gesondert nachweisen. [S19]

#### Felder sicher 2023?

Nicht als native 2023-Signatur-/Aktivierungsprüfung bestätigt. Ein neuerer Public-2608-Hinweis ändert ausdrücklich die Herkunft von CustomerName; genau deshalb keine semantische Gleichheit über Releases unterstellen. [S21]

#### R05 oder R03?

R03 ist für Standard-ABAP mit zulässiger API-Menge klarer. Nachfolgersein allein beweist keine eigene Freigabe, und ein Nachfolger kann wiederum abgelöst werden.

#### Quelle/Target?

Dasselbe Profilpaar muss Source-Erklärung und Targetkompatibilität getrennt ausgeben. Kein menschlicher Freigabestatus aus beiden Feldern ableiten.

#### Ohne System offen?

Feld-/Berechtigungsdetails im festgelegten Support Package, Aktivierung, vollständige API-Vertragsattribute. Der eigene released-Eintrag ist nicht mehr bloß geraten.

### 8. Praxisbezug und Freigabe

Nicht aus eigener Produktionsverantwortung belegt. Das Muster ist als konstruiertes Prüfbeispiel plausibel; keine Häufigkeitsschätzung und keine behauptete Kundenerfahrung.

**Reviewstatus:** Stellungnahme zu Quelle und Sollantwort; **kein** Status `architekt`, keine Vollfreigabe des Falls. Ein fachlich bestätigter Teilbefund darf getrennt erfasst werden, nicht in eine Gesamtabnahme hochstufen.

### 9. Gelieferte Quellen — unverändert extrahiert

#### `source.abap`

```abap
REPORT zcc_ref_058.
PARAMETERS p_land TYPE c LENGTH 3 DEFAULT 'DE'.
START-OF-SELECTION.
  SELECT Customer, CustomerName, Country
    FROM i_customer
    WHERE Country = @p_land
    ORDER BY Customer
    INTO TABLE @DATA(lt_customers).
  IF lt_customers IS INITIAL.
    WRITE / 'NO_MATCH'.
    RETURN.
  ENDIF.
  LOOP AT lt_customers INTO DATA(ls_customer).
    WRITE: / ls_customer-Customer, ls_customer-CustomerName.
  ENDLOOP.
```

---

## CC-060 — Profilpaar mit `release_contract`: kundeneigener Wrapper mit C1-Freigabe liest KNA1 — das Level des Konsumenten stoppt am Vertrag, `known_worst` nicht

**Urteil:** Kapselungsidee tragfähig; nur unter explizitem Bewertungsumfang und vollständigem C1-Kontext.

**Original:** `referenzkorpus-v2.md`, ab Zeile 9641. **Zielprofil gelesen:** ja. **Modus:** nicht blind. **Native Ausführung:** nicht erfolgt.

**Anker-Aliasse:** `wrapper` = `zcl_customer_api.clas.abap`; `consumer` = `zcl_route_service.clas.abap`.

### 1. Level und Bewertungsumfang

| Feld | Reviewantwort | Sicherheit |
|---|---|---|
| `classic_extension.level` | Wrapper: C; Konsument: B in Profil 1, A-Kandidat in Profil 2; gesamter gelieferter Scope: mindestens C | wahrscheinlich; Bedingungen siehe Begründung |
| `known_worst_level` | C im ausdrücklich transitiven Zwei-Dateien-Scope | wahrscheinlich; Bedingungen siehe Begründung |
| `cloud_api_surface` | Wrapper not_usable; Konsument usable nur bei gültigem C1-/Sichtbarkeitskontext | wahrscheinlich; Bedingungen siehe Begründung |
| `cloud_artefact` | Wrapper not_activatable; Konsument nur bedingt activatable, nicht nativ geprüft | wahrscheinlich; Bedingungen siehe Begründung |

C1-Freigabe für klassische kundeneigene Wrapper ist ein zulässiger Architekturweg; die bloße Existenz des Strings C1 genügt aber nicht. Releasezustand, Vertragsnutzung/Sichtbarkeit, Signatur und Zugriffsgrenzen müssen ebenfalls stimmen. Komponenten-A für den Cloud-Konsumenten und C für die betrachtete gesamte Erweiterung sind vereinbar, wenn die Scopes ausdrücklich verschieden heißen. Eine nackte A-Kachel mit verborgenem C-Unterbau wäre irreführend. known_worst=C ist eine Korpusaggregation über beide Dateien, keine automatische SAP-Norm für jede Komponente. [S01,S02,S04]

### 2. Erwartete Befunde

Schweregrade sind Reviewprioritäten, keine SAP-ATC-Nummern.

| Statementbeginn | Konstrukt / Regel | Schwere | Reviewbefund |
|---|---|---|---|
| wrapper:10 | Interner Read / R01 | mittel | KNA1 im Wrapper unter dem stipulierten internen Profil: C. Nicht vom C1-Label des Wrappers auf eigene Level-A-Implementierung schließen. |
| consumer:11 | Freigabegrenze / R30 | hoch | Vertrag aus vertrauenswürdigem Kontext verifizieren; sonst nur bedingte API-Nutzbarkeit. |
| consumer:12 | Fachliche Bedingung / R18 | mittel | Name initial ist nicht identisch mit Kunde existiert nicht. |
| consumer:16 | Anker-/Ausdruckssemantik / R27 | mittel | COND-Gateway und zwei Ergebnisarme auf derselben Zeile brauchen expression_path/Spalten-/Arm-IDs, nicht nur Zeile plus Knotentyp. |

### 3. SAP-Objekte und Nachfolger

| Objekt | Typisierte Identität | Nachfolger / Begründung | Drop-in |
|---|---|---|---|
| KNA1 | TABL/KNA1; TABL/KNA1 | DDLS/I_CUSTOMER; CDS_STOB/I_CUSTOMER [S19] | nicht bewiesen |
| ZCL_CUSTOMER_API | CLAS/ZCL_CUSTOMER_API; CLAS/ZCL_CUSTOMER_API | kundeneigener Wrapper; C1 ist Kontextmetadatum, kein SAP-Katalogeintrag | nicht anwendbar |
| ZCL_ROUTE_SERVICE | CLAS/ZCL_ROUTE_SERVICE; CLAS/ZCL_ROUTE_SERVICE | kundeneigener Konsument mit eigener Sprachversion | nicht anwendbar |

### 4. Fachsätze — Vergleich mit dem vorgelegten Soll

| Satz | Vergleichsurteil | Präzise Reviewfassung | Quellanker |
|---|---|---|---|
| B01 | stimme in präziser Fassung zu | Wenn get_name einen initialen String liefert, setzt determine UNKNOWN_CUSTOMER und kehrt zurück. Auch ein existierender Kunde mit initialem NAME1 kann diesen Pfad auslösen. | consumer:11–15;wrapper:10–16 |
| B02 | widerspreche der Verkürzung „bekannter Kunde“ | Bei nicht initialem zurückgegebenem Namen wird für iv_amount>10000 MANAGER_ROUTE, sonst AUTO_ROUTE gesetzt. Der Code prüft keine Währung, keine tatsächlich erfolgte Freigabe und keinen unabhängigen Existenzindikator. | consumer:12–16 |
| B03 | stimme zu mit Scopehinweis | Die vorliegende Wrapperimplementierung liest NAME1 aus KNA1. Der Aufrufertext verwendet die Wrapper-API; das gemeinsame Analysepaket enthält gleichwohl beide Quellen und kann den transitiven Bezug darstellen. | wrapper:10–15;consumer:11 |

### 5. Prozessskelett

determine-start → wrapper-call → KNA1-read → Rückgabewert ggf. setzen → name-empty-guard → UNKNOWN_CUSTOMER/return oder amount-guard → MANAGER_ROUTE/AUTO_ROUTE → return. Die Wrapper-sy-subrc-Prüfung ist entweder als eigener Knoten zu zeigen oder mit einer dokumentierten Abstraktion in den Call-/Read-Knoten aufgenommen. Für COND an consumer:16 armspezifische Anker verwenden. Keine Datenbankpersistenz und keine echte Genehmigung vorhanden.

### 6. Sicherheit / Berechtigung

C1 ist keine Securityfreigabe und keine automatische Berechtigungsprüfung. Die sichtbare KNA1-Abfrage kann weitere Zugriffskontrollen benötigen, die im Slice nicht nachgewiesen sind. Der Review erfindet weder einen konkreten erforderlichen Berechtigungsobjektnamen noch eine tatsächlich ausnutzbare Lücke.

### 7. Antworten auf Prüferfragen und offene Nachweise

#### Level stoppt am Vertrag, known_worst nicht?

Als explizite Mehrscope-Konvention zulässig: component_contract_level und extension_transitive_level getrennt. Für ein und denselben behaupteten Gesamtscope wäre A und C widersprüchlich. Alle UI-/Exportlabels müssen den Scope mitführen.

#### Standard-Wrapper mit C1 aus Cloud nutzbar?

Ja, als dokumentiertes Wrappermodell, unter tatsächlich freigegebenem Zustand und Cloud-Sichtbarkeit. Nicht alle klassischen Wrapper sind dadurch automatisch A oder generell zulässig. [S02,S04]

#### PCE2022 passend für S/4 2023?

Der Dateiname und Beobachtungsstand sind ein nachvollziehbarer Fixturebezug, aber kein vollständiger exakter 2023-Support-Package-Pin. Nicht stillschweigend aus einem PCE2022-Ausschnitt ein geprüfter 2023-Katalog machen.

#### Fachsätze und Anker?

B02 muss „Name nicht initial“ statt „Kunde bekannt“ sagen; B01 benötigt Wrapperbezug. Der Grenzfall genau 10000 geht AUTO. Währung fehlt.

#### Offene Aktivierung?

Tatsächlicher Wrapper-Releasezustand, Usage Visibility, Interface-/Packagekontext, Zielsyntax/-Aktivierung und tatsächliche Ergebnisgleichheit nach Ersatz durch I_CUSTOMER.

### 8. Praxisbezug und Freigabe

Nicht aus eigener Produktionsverantwortung belegt. Das Muster ist als konstruiertes Prüfbeispiel plausibel; keine Häufigkeitsschätzung und keine behauptete Kundenerfahrung.

**Reviewstatus:** Stellungnahme zu Quelle und Sollantwort; **kein** Status `architekt`, keine Vollfreigabe des Falls. Ein fachlich bestätigter Teilbefund darf getrennt erfasst werden, nicht in eine Gesamtabnahme hochstufen.

### 9. Gelieferte Quellen — unverändert extrahiert

#### `zcl_customer_api.clas.abap`

```abap
CLASS zcl_customer_api DEFINITION PUBLIC FINAL CREATE PRIVATE.
  PUBLIC SECTION.
    CLASS-METHODS get_name
      IMPORTING iv_kunnr       TYPE c
      RETURNING VALUE(rv_name) TYPE string.
ENDCLASS.

CLASS zcl_customer_api IMPLEMENTATION.
  METHOD get_name.
    SELECT SINGLE name1
      FROM kna1
      WHERE kunnr = @iv_kunnr
      INTO @DATA(lv_name).
    IF sy-subrc = 0.
      rv_name = lv_name.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
```

#### `zcl_route_service.clas.abap`

```abap
CLASS zcl_route_service DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS determine
      IMPORTING iv_kunnr        TYPE c
                iv_amount       TYPE p
      RETURNING VALUE(rv_route) TYPE string.
ENDCLASS.

CLASS zcl_route_service IMPLEMENTATION.
  METHOD determine.
    DATA(lv_name) = zcl_customer_api=>get_name( iv_kunnr ).
    IF lv_name IS INITIAL.
      rv_route = 'UNKNOWN_CUSTOMER'.
      RETURN.
    ENDIF.
    rv_route = COND #( WHEN iv_amount > 10000 THEN 'MANAGER_ROUTE' ELSE 'AUTO_ROUTE' ).
  ENDMETHOD.
ENDCLASS.
```

---

## CC-023 — Direktes SAP-UPDATE mit Testmodus: D trotz CDS-Nachfolger

**Urteil:** D und Testpfad bestätigt; ursprünglicher und vorgeschlagener Fachsatz zu weit.

**Original:** `referenzkorpus-v2.md`, ab Zeile 3561. **Zielprofil gelesen:** ja. **Modus:** nicht blind. **Native Ausführung:** nicht erfolgt.

### 1. Level und Bewertungsumfang

| Feld | Reviewantwort | Sicherheit |
|---|---|---|
| `classic_extension.level` | D | sicher; Bedingungen siehe Begründung |
| `known_worst_level` | D | sicher; Bedingungen siehe Begründung |
| `cloud_api_surface` | not_usable | sicher; Bedingungen siehe Begründung |
| `cloud_artefact` | not_activatable | sicher; Bedingungen siehe Begründung |

Der Testmodus umgeht im gelieferten Slice das direkte UPDATE. Das nimmt dem Programm als Ganzem aber nicht seinen vorhandenen nicht unterstützten SAP-Schreibweg. D bleibt daher als technischer Kandidat korrekt. Die Datenänderung selbst ist von nicht gesetztem Testmodus, passendem Schlüssel und normalem DB-Abschluss abhängig. [S01]

### 2. Erwartete Befunde

Schweregrade sind Reviewprioritäten, keine SAP-ATC-Nummern.

| Statementbeginn | Konstrukt / Regel | Schwere | Reviewbefund |
|---|---|---|---|
| 6 | Testmode-Guard / R19 | niedrig | Bei X keine DB-Änderung im gelieferten Pfad. |
| 10 | SAP-Write / R02 | hoch | Direktes UPDATE KNA1; CDS-Lesenachfolger ist kein Ersatz. |
| 10 | Schlüsselformat / R18 | mittel | p_kunnr ist generisch c(10), keine automatische DDIC-ALPHA-Eingabekonvertierung; Treffer datenabhängig. |
| 12 | Commit / R25 | mittel | Nach UPDATE-sy-subrc 0 COMMIT WORK AND WAIT. Die Bedeutung des AND WAIT ist nicht mit zusätzlichem Beweis der fachlichen Richtigkeit gleichzusetzen. |

### 3. SAP-Objekte und Nachfolger

| Objekt | Typisierte Identität | Nachfolger / Begründung | Drop-in |
|---|---|---|---|
| KNA1 | TABL/KNA1; TABL/KNA1 | DDLS/I_CUSTOMER; CDS_STOB/I_CUSTOMER | nein für direkte Schreibsemantik |

### 4. Fachsätze — Vergleich mit dem vorgelegten Soll

| Satz | Vergleichsurteil | Präzise Reviewfassung | Quellanker |
|---|---|---|---|
| B01 | stimme zu | Im gewählten Testpfad wird SIMULATION_ONLY ausgegeben und vor UPDATE zurückgekehrt. Default X ist Vorbelegung, kein dauerhaftes Schreibverbot. | 4,6–9 |
| B02 | widerspreche der Unbedingtheit | Außerhalb des Testpfads wird versucht, NAME1 für den exakt passenden Kundenschlüssel zu ändern. Nur bei Treffer/normalem Abschluss folgt der Commitzweig. Keine implizite ALPHA-Konvertierung; fehlende Nullen sind nur für entsprechend numerisch kodierte Schlüssel ein Problem. | 2,10–13 |
| B03 | stimme zu | Nach UPDATE-sy-subrc 0 wird COMMIT WORK AND WAIT aufgerufen, sonst ROLLBACK WORK. Der Code hat keine weitere fachliche Ergebnisprüfung. | 11–17 |

### 5. Prozessskelett

start:5 → test_guard:6 → output SIMULATION_ONLY:7/return:8 oder UPDATE-attempt:10 → sy-subrc:11 → commit:12/output:13 bzw. rollback:15/output:16. Das ursprünglich verdichtete Skelett darf die Testausgabe im Return-Knoten zusammenfassen, sofern der Abstraktionsvertrag dies zulässt; nicht jede fehlende separate Ausgabe ist automatisch ein fachlicher Fehler.

### 6. Sicherheit / Berechtigung

Direktes SAP-Update ist nicht unterstützt; das ist nicht gleichbedeutend mit einer vollständig geprüften Schwachstelle. Sichtbare Businessberechtigungen fehlen im Slice, aber Start-/Tabellen-/Hostkontext wurde nicht vollständig untersucht.

### 7. Antworten auf Prüferfragen und offene Nachweise

#### ALPHA-Korrektur aus §11 übernehmen?

Ja zur Bedingung und zum Testfall numerisch 1000 versus 0000001000. Nein zum universellen Satz „ohne führende Nullen kein Treffer“: alphanumerische Schlüssel können korrekt ungefüllt sein. [S15]

#### Ist §11 bereits konsolidiert?

Nein. Der spätere Fallkörper enthält weiterhin die alte unbedingte B02-Fassung. Ein textlicher Vorranghinweis verhindert nicht, dass ein Importer das falsche Soll übernimmt.

#### Commit-Ergebnis extra prüfen?

Der Korpus darf die fehlende separate Prüfung beschreiben. Nicht automatisch einen zusätzlichen Fehler behaupten, nur weil COMMIT-sy-subrc nicht geprüft wird: im vorliegenden direkten SQL-Slice wurde keine Update-Task-Registrierung gezeigt.

#### Ohne System offen?

Schlüssel-/Datendomäne im konkreten System, geeignete fachliche Schreib-API, Berechtigungs-/Sperr-/Validierungskonzept und native Verprobung. D braucht dagegen keinen beobachteten erfolgreichen Schreibversuch.

### 8. Praxisbezug und Freigabe

Nicht aus eigener Produktionsverantwortung belegt. Das Muster ist als konstruiertes Prüfbeispiel plausibel; keine Häufigkeitsschätzung und keine behauptete Kundenerfahrung.

**Reviewstatus:** Stellungnahme zu Quelle und Sollantwort; **kein** Status `architekt`, keine Vollfreigabe des Falls. Ein fachlich bestätigter Teilbefund darf getrennt erfasst werden, nicht in eine Gesamtabnahme hochstufen.

### 9. Gelieferte Quellen — unverändert extrahiert

#### `source.abap`

```abap
REPORT zcc_ref_023.
PARAMETERS p_kunnr TYPE c LENGTH 10.
PARAMETERS p_name TYPE c LENGTH 35 LOWER CASE.
PARAMETERS p_test AS CHECKBOX DEFAULT 'X'.
START-OF-SELECTION.
  IF p_test = 'X'.
    WRITE / 'SIMULATION_ONLY'.
    RETURN.
  ENDIF.
  UPDATE kna1 SET name1 = @p_name WHERE kunnr = @p_kunnr.
  IF sy-subrc = 0.
    COMMIT WORK AND WAIT.
    WRITE / 'UPDATE_COMMITTED'.
  ELSE.
    ROLLBACK WORK.
    WRITE / 'NO_UPDATE'.
  ENDIF.
```
