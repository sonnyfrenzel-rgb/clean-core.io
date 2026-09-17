# 1. Urteil

Der Korpus v1 hält als **Ground Truth für reale Programme nicht**. Er hält als das, was er selbst zu sein behauptet: ein enger, reproduzierbarer Satz von Mikro-Gegenbeispielen für eine Vergleichsmechanik. Seine 25 Fälle sind Reports von 5–34 Zeilen ohne Berechtigungsprüfung, ohne LUW-Semantik, ohne Hostkontext, ohne UI-Automatisierung, ohne Typabhängigkeiten außerhalb von SQL und ohne eine einzige Stelle, an der ein Literal zur Laufzeit zu Code oder zu einer Abhängigkeit wird. Genau diese Klassen machen in produktiven Kundensystemen den Großteil des Clean-Core-Risikos aus.

**Schwerwiegendster Einzelmangel:** Regel R13 („Zeichenliterale und Stringtemplates sind keine ausgeführten Statements") ist im Korpus **nur in eine Richtung** verankert und wird durch CC-016 als Negativkontrolle aktiv trainiert. Real wird das Literal an mindestens fünf Stellen zur Abhängigkeit oder zum Code: ADBC (`cl_sql_statement->execute_update( 'UPDATE KNA1 …' )`), `EXEC SQL`, `GENERATE SUBROUTINE POOL`, `ASSIGN ('(SAPMV45A)VBAK-VBELN')`, `describe_by_name( 'KNA1' )`, ALV-Callback-FORMs im Literal. Ein Werkzeug, das den Korpus vollständig besteht, würde ein KNA1-Update per ADBC mit **null Befunden und Level B** durchlassen. Das ist eine Fehlentscheidung mit Kundenwirkung.

Zweitschwerster Mangel: Der Level-Vertrag kennt keine Aussageklasse für **Berechtigung/Sicherheit** und kein Feld für **Release-Vertrag kundeneigener Objekte** (Tier-2-Wrapper). Beides entscheidet in realen Projekten über Architektur und Compliance, nicht die Frage, ob eine CONSTANTS-Bindung statisch ist.

Die bisherige Härtungsstudie hat den Vergleicher wertvoll gehärtet, aber ihre 103 Realfälle stammen aus Werkzeugcode (Repository-Tabellen, Excel-Konvertierung) und enthalten **keinen** Geschäftsdatenzugriff, keine Berechtigung, keine Transaktion, keinen Host-Exit. Ihre 14 Erweiterungsvorschläge (RV-026–039) schließen keine der hier gefundenen kritischen Lücken.

# 2. Die Fälle

Legende Beleggrad: `verifiziert` = die genannten SAP-Objekte/Syntaxelemente existieren sicher (der Codeausschnitt selbst ist immer nachgebaut, keine Fundstelle); `erinnert` = Muster aus einem benannten öffentlichen Projekt, Stelle nicht belegbar; `konstruiert` = aus Kundencode-Praxis nachgebaut, keine Fundstelle. Keine Zeile behauptet eine GitHub-URL oder Zeilennummer.

| ID | ABAP-Konstrukt | Herkunft | Beleggrad | Angriffspunkt | Was der Korpus sagen würde | Was richtig wäre | Schwere |
|---|---|---|---|---|---|---|---|
| KA-001 | `DEFINE zsel. SELECT * FROM &1 INTO TABLE lt_&1. END-OF-DEFINITION. zsel kna1. zsel knb1.` | FI-Altreports | konstruiert | Makroexpansion: Statement steht nur im Makrorumpf | 1 SELECT an Definitionszeile, Tabelle `&1` unbekannt | 2 Lesebefunde (KNA1, KNB1) an den Expansionszeilen, C | hoch |
| KA-002 | `PERFORM: read_hdr, read_items, write_log.` | Reports | konstruiert | Kettensatz = 3 Statements auf einer Zeile | ein Knoten/ein Anker | drei opake Aufrufe; bestätigt F05 (Statement-ID nötig) | mittel |
| KA-003 | `CALL FUNCTION` mit Literal `'BAPI_…'` auf Folgezeile | Pretty-Printer | konstruiert | Ankerzeile Statementbeginn vs. Literalzeile | Vertrag legt Ankerzeile nicht fest → Comparator kann korrekte Antwort ablehnen | Statementbeginn + Tokenoffset als Primäranker, Literalzeile sekundär | mittel |
| KA-004 | CC-007 F01–F03 (je JOIN-Zeile) vs. F04 (Bereich 4–8) | Korpus selbst | verifiziert | zwei Ankerkonventionen für ein Statement | beide gleichzeitig | eine Konvention: Statementbereich + Tokenoffset je Tabelle | mittel |
| KA-005 | `SELECT … "#EC CI_NOWHERE` | Kundencode | konstruiert | Pseudokommentar = ATC-Unterdrückung | ignoriert | Befund bleibt; Unterdrückung als Attribut, sonst ATC-Vergleich inkonsistent | niedrig |
| KA-006 | `##NO_HANDLER`, `##NEEDED` | abapGit (RC-036) | verifiziert | Pragma-Token | evtl. als Bezeichner gelesen | Pragma erkennen, ATC-relevant | niedrig |
| KA-007 | `` `it''s "x"` ``, `|\|{ \{ }|` | Kundencode | konstruiert | Lexergrenzen | unspezifiziert | Lexer-Kontrollen der Studie als Korpusfälle | niedrig |
| KA-008 | `TYPES BEGIN OF ty. INCLUDE STRUCTURE kna1. TYPES END OF ty.` | überall | konstruiert | `INCLUDE` ohne Programmbezug | R16 „fehlendes Include" (high) oder nichts | DDIC-Typabhängigkeit auf KNA1 (in Cloud nicht freigegeben), kein fehlendes Include | hoch |
| KA-009 | `DATA ls TYPE kna1. DATA lv TYPE kna1-kunnr.` | überall | konstruiert | Typreferenz ohne SQL | keine Regel → B, keine Abhängigkeit | DDIC-Abhängigkeit KNA1; C-relevant; Nachfolger auf Strukturebene prüfen | hoch |
| KA-010 | `TABLES: kna1. SELECT SINGLE * FROM kna1 WHERE kunnr = p_kunnr.` | Altcode | konstruiert | implizites INTO in Arbeitsbereich | Parser erwartet INTO | Read + globaler Arbeitsbereich als Zustand | mittel |
| KA-011 | `SELECT-OPTIONS s_kunnr FOR kna1-kunnr.` + `WHERE kunnr IN @s_kunnr` | überall | konstruiert | FOR = Typabhängigkeit; leerer Range = alle | Fachsatz „nur selektierte Kunden" | leer = keine Einschränkung, Vollzugriff; Typabhängigkeit | mittel |
| KA-012 | `RANGES r_kunnr FOR kna1-kunnr.` | Altcode | konstruiert | obsolet + Typabhängigkeit | nichts | wie KA-011, zusätzlich „nicht in Cloud" | niedrig |
| KA-013 | `MODIFY kna1 FROM ls_kna1.` | Kundencode | konstruiert | MODIFY DB | R02 nennt UPDATE; MODIFY unklar | D wie UPDATE | mittel |
| KA-014 | `MODIFY lt_kna1 FROM ls.` (itab `TABLE OF kna1`) | Kundencode | konstruiert | gleiches Keyword, interne Tabelle | Verwechslung mit DB-Write möglich | kein DB-Write; aber Typabhängigkeit (KA-009) | mittel |
| KA-015 | `MODIFY (lv_tab) FROM <fs>.` in Z-Tabellenpflege-Tool | SE16-Klone in Kundensystemen | konstruiert | dynamisches Schreibziel | Unknown | worst-case D, Allowlist verlangt, Security-Befund | kritisch |
| KA-016 | `CREATE DATA lr TYPE STANDARD TABLE OF (lv_tab). SELECT * FROM (lv_tab) INTO TABLE <lt>.` Download-Tool | Kundensysteme | konstruiert | generisches Lesen beliebiger SAP-Tabellen (auch USR02) | Unknown wie CC-020 | Unknown-Level plus Datenschutz-/Security-Befund; Level-Feld reicht nicht | kritisch |
| KA-017 | `EXEC SQL. UPDATE KNA1 SET NAME1 = :lv WHERE … ENDEXEC.` | Altcode | konstruiert | Native SQL | kein Open-SQL-UPDATE → B | D, nicht in Cloud, kein Nachfolger | hoch |
| KA-018 | `lo_stmt->execute_update( |UPDATE KNA1 SET … { iv }| )` ADBC | Kundencode | konstruiert | SQL als Literal, ausgeführt | R13: Literal ≠ Statement → B, 0 Befunde | D; R13 gilt nur für nicht interpretierte Literale | kritisch |
| KA-019 | `SELECT … FROM (lv_tab)` mit `lv_tab` aus TVARVC | Kundencode | konstruiert | Ziel aus Customizing | Unknown | Unknown korrekt; Customizing-Quelle als Kontextbeleg erfassen | mittel |
| KA-020 | `SELECT kunnr FROM i_customer WHERE …` im klassischen REPORT | Kundencode nach S/4-Migration | konstruiert | released CDS lesen | R01 kennt nur „intern stipuliert" → C oder nichts | released API-Lesen → nicht C; Cloud-API usable; Report bleibt klassisch | hoch |
| KA-021 | `SELECT … FROM i_customer WITH PRIVILEGED ACCESS` | Kundencode | erinnert (Syntax) | Berechtigungsumgehung sieht clean aus | kein Befund | Befund: DCL umgangen; Compliance | hoch |
| KA-022 | `SELECT … FROM kna1 CLIENT SPECIFIED WHERE mandt = …` | Basis-Tools | konstruiert | mandantenübergreifend | R01 C | C + Befund „Cross-Client, nicht in Cloud" | mittel |
| KA-023 | `SELECT … FROM kna1 … COMMIT WORK. … ENDSELECT.` | Altcode | konstruiert | Commit im DB-Cursor | read + transaction | loop-Knoten; Commit invalidiert Cursor → Laufzeitfehler | hoch |
| KA-024 | `SELECT SINGLE * FROM kna1 WHERE name1 = lv.` | Kundencode | konstruiert | Nichtschlüsselzugriff | Fachsatz „liest den Kunden" | „liest einen beliebigen Kunden dieses Namens" | mittel |
| KA-025 | `SELECT netwr FROM vbap FOR ALL ENTRIES IN lt WHERE vbeln = lt-vbeln` (ohne Schlüssel in Projektion) | SAP-dokumentiertes Verhalten | verifiziert | FAE-Duplikateliminierung | Guard-Fokus, Fachsatz „summiert alle Positionen" | Duplikate entfallen → Summe falsch; eigener Befund | hoch |
| KA-026 | FAE-Guard als `CHECK lt IS NOT INITIAL.` / `IF lines( lt ) = 0. RETURN.` / SELECT-`sy-subrc` | Kundencode | konstruiert | Guard-Formen | R09 evtl. nur `IF … IS INITIAL` | alle drei sind Guards; CHECK-Kontext beachten | mittel |
| KA-027 | Guard steht **nach** dem FAE-SELECT | Kundencode | konstruiert | Guard-Position | Guard vorhanden → kein Befund | ungesichertes FAE, Guard wirkungslos | mittel |
| KA-028 | `LEFT OUTER JOIN knb1 AS b … WHERE b~bukrs = @p OR b~bukrs IS NULL` | Kundencode | konstruiert | R08/CC-008-Aussage | „WHERE auf rechter Tabelle verwirft NULL-Treffer" | NULL-Zeilen bleiben; Regel muss Prädikat lesen | hoch |
| KA-029 | `LEFT OUTER JOIN knvv AS c … WHERE c~kunnr IS NULL` (Anti-Join) | Kundencode | konstruiert | NULL-Filter als Fachlogik | „Filter entfernt Nulltreffer" | Ergebnis = Kunden **ohne** Vertriebsbereich, das Gegenteil | hoch |
| KA-030 | `EXPORT lt TO DATABASE indx(zx) ID lv_id.` | Kundencode | konstruiert | Cluster-Write auf SAP-Tabelle INDX | R02 D | strittig: INDX ist für Kundennutzung ausgelegt (klassisch B); Cloud n/a; Streitfall dokumentieren | hoch |
| KA-031 | `INSERT ztab FROM ls. IF sy-subrc <> 0. MESSAGE e001(zz). ENDIF.` | Kundencode | konstruiert | MESSAGE E als Abbruch | end-Knoten? | kontextabhängig (Liste/Dialog/Batch/RFC); impliziter Rollback | hoch |
| KA-032 | `OPEN CURSOR WITH HOLD … FETCH NEXT CURSOR … PACKAGE SIZE` | Massenverarbeitung | konstruiert | Cursor über Commit | kein Knotentyp | loop mit gehaltenem Cursor; WITH HOLD ändert Commit-Semantik | mittel |
| KA-033 | `SELECT bname, bcode FROM usr02` | Basis-Tools | konstruiert | sensible Tabelle | R01 C | C + Sicherheitsbefund; „Nachfolger" ist Verbot, nicht CDS | mittel |
| KA-034 | `SELECT low FROM tvarvc WHERE name = 'Z_LIMIT'` | Kundencode | konstruiert | klassische Variablentabelle | C falls stipuliert | strittig; Nachfolger eigene Konfiguration/Business Configuration | mittel |
| KA-035 | `SELECT … FROM dd03l WHERE tabname = 'KNA1'` | Generische Tools | konstruiert | Metadaten lesen | C | C mit Nachfolger RTTI/XCO; Literal `'KNA1'` ist zusätzlich Abhängigkeit | mittel |
| KA-036 | `SELECT * FROM kna1 UP TO 1 ROWS ORDER BY PRIMARY KEY … ENDSELECT.` vs. `SELECT SINGLE` | Kundencode | konstruiert | Determinismus | gleicher read | unterschiedliche Fachaussage (definierter erster Satz vs. beliebiger) | niedrig |
| KA-037 | `UPDATE kna1 FROM TABLE lt.` | Kundencode | konstruiert | Massenupdate | D | D; LUW-Größe zusätzlich | niedrig |
| KA-038 | `lv_fm` in zwei IF-Zweigen zugewiesen, dann `CALL FUNCTION lv_fm` | Kundencode | konstruiert | Zielmenge 2 | Singleton (CC-011) oder Unknown | Zielmenge {A,B}, beide klassifizieren; Auswerter muss Listen akzeptieren | mittel |
| KA-039 | `CONCATENATE 'CONVERSION_EXIT_' ls_dfies-convexit '_INPUT' INTO lv_fm.` | verbreitetes Muster | konstruiert | familiengebundene Zielmenge | Unknown | „pattern-bounded": Familie `CONVERSION_EXIT_*_INPUT`, Level über Familie | mittel |
| KA-040 | `CALL FUNCTION 'Z_ORDER_CREATE' DESTINATION lv_dest` | Kundencode | konstruiert | RFC-Ziel | statisch → lokaler Kunden-FM (B) | Remote-Ziel, Quelle im Fremdsystem, Systemgrenze im Skelett, impliziter Commit | hoch |
| KA-041 | `BAPI_SALESORDER_CREATEFROMDAT2` + `BAPI_TRANSACTION_COMMIT` | SAP-dokumentiertes Muster | verifiziert | Paarsemantik | zwei opake Aufrufe | Fachsatz „Auftrag angelegt" nur mit Commit; ohne = kein Effekt | hoch |
| KA-042 | `CALL FUNCTION 'Z_UPD' IN UPDATE TASK … COMMIT WORK.` | Kundencode | konstruiert | verzögerte Ausführung | Aufruf an Stelle | Ausführung beim COMMIT (V1), nicht an Aufrufstelle; ROLLBACK verwirft | hoch |
| KA-043 | `CALL FUNCTION 'Z_X' STARTING NEW TASK lv CALLING on_end ON END OF TASK` | Parallelverarbeitung | konstruiert | asynchron + Callback | opak | paralleler Zweig; Handler statisch benannt → Anker | mittel |
| KA-044 | `CALL FUNCTION 'Z_X' IN BACKGROUND TASK DESTINATION 'NONE'` | Kundencode | konstruiert | tRFC | opak | asynchron nach COMMIT; Nachfolger bgRFC/BPF | mittel |
| KA-045 | `CALL FUNCTION 'Z_X' DESTINATION 'NONE'` | Kundencode | konstruiert | eigener Rollbereich | statischer Kunden-FM | ABAP-Memory nicht geteilt; impliziter Commit; eigene LUW | mittel |
| KA-046 | `CALL FUNCTION 'Z_X' EXCEPTIONS error_message = 1` | Kundencode | konstruiert | MESSAGE E im Ziel wird sy-subrc | opak | Terminierungssemantik des Ziels umgekehrt | mittel |
| KA-047 | `PERFORM form(zprog) USING …` | Altcode | konstruiert | statisches externes PERFORM | K06 kennt nur `IN PROGRAM` dynamisch | statische Abhängigkeit auf ZPROG; LOAD-OF-PROGRAM läuft mit | mittel |
| KA-048 | `CALL METHOD (lv_class)=>(lv_meth) PARAMETER-TABLE lt_ptab.` | Frameworks | konstruiert | voll dynamisch | keine Regel (R14 nur super/dispatch) | Unknown, Interface unbekannt, Security | hoch |
| KA-049 | `CREATE OBJECT lo TYPE (lv_class)` mit `lv_class = 'ZCL_HANDLER_' && lv_type` | abapGit-Objektfabrik (ohne Zeile) | erinnert | namensfamiliengebunden | Unknown | Familie `ZCL_HANDLER_*`; known_worst über Familie | mittel |
| KA-050 | `cl_exithandler=>get_instance CHANGING instance = lo.` (IF_EX_*) | SAP-dokumentiert | verifiziert | klassischer BAdI | statischer Aufruf nicht freigegebener SAP-Klasse → C? | klassische BAdI-Nutzung B; Nachfolger neue BAdI/Spot; nicht C | hoch |
| KA-051 | `CALL CUSTOMER-FUNCTION '001'` im SAP-Host | Syntax SAP | verifiziert | SMOD-Exit | keine Regel | Kundenanteil in `EXIT_*`-FM; klassischer Exit, cloud-unfähig, Level D-nah/strittig | hoch |
| KA-052 | `FORM userexit_save_document_prepare.` in `MV45AFZZ` | SD-Praxis | verifiziert (Include) | Hostbindung per Namenskonvention | R03 B (isoliert) | D durch Kontext SAPMV45A; namentlich erkennbar ohne Metadaten | kritisch |
| KA-053 | `*{ INSERT DEVK900123 1` … `*} INSERT` | Modifikationsassistent | verifiziert (Syntax) | Marker als Kommentar | R13 → kein Befund | D (Modifikation), schwerer als implizites Enhancement | kritisch |
| KA-054 | `ENHANCEMENT 1 zenh_x. … ENDENHANCEMENT.` | Syntax SAP | verifiziert | Enhancement im Quelltext | CC-010 verlangt Kontext | syntaktisch erkennbar; implizit/explizit über Spot-Metadaten | hoch |
| KA-055 | `ENHANCEMENT-POINT zep_01 SPOTS zes_01.` im Z-Report | Kundencode | konstruiert | expliziter Kunden-Punkt | Keyword-Treffer → D | B; Definition eines Punkts ist kein Eingriff | hoch |
| KA-056 | `GET BADI lo FILTERS vkorg = lv. CATCH cx_badi_not_implemented.` | Kundencode | konstruiert | dynamischer Filter, Ausnahmepfad | R24 Kontext | Implementierungsmenge Unknown; Exception-Pfad im Skelett | mittel |
| KA-057 | `INTERFACES if_ex_me_process_po_cust.` + `SELECT FROM ekko` | MM-Praxis | verifiziert (Interface) | SAP-Standard-BAdI implementiert | Interface-Inklusion | Hook B, Lesen C, known_worst C | mittel |
| KA-058 | `SUBMIT zrep WITH p_x = lv AND RETURN EXPORTING LIST TO MEMORY.` + `LIST_FROM_MEMORY` | Kundencode | verifiziert (FM) | Programmaufruf + Listspeicher | keine Regel | opaker Programmaufruf; Selektionsübergabe; Listspeicher-Seiteneffekt | hoch |
| KA-059 | `CALL TRANSACTION 'XD01' USING lt_bdc MODE 'N' UPDATE 'S' MESSAGES INTO lt_msg.` | Batch-Input-Praxis | verifiziert (Syntax/TA) | UI-Automatisierung | keine Regel → B, 0 Befunde | Abhängigkeit auf SAP-Dynpro-Folge; XD01 in S/4 durch BP ersetzt; Nachfolger API | kritisch |
| KA-060 | `SET PARAMETER ID 'KUN' FIELD lv. CALL TRANSACTION 'XD03' AND SKIP FIRST SCREEN.` | abapGit-Jumper-Muster | erinnert | SPA/GPA | nichts | Sitzungsspeicher + Transaktionsabhängigkeit | mittel |
| KA-061 | `LEAVE TO TRANSACTION 'ZTX'.` | Kundencode | konstruiert | Programmende + impliziter Commit | end? | Ende + impliziter DB-Commit; ROLLBACK davor wirkungslos danach | mittel |
| KA-062 | `GENERATE SUBROUTINE POOL lt_src NAME lv_prog.` + `PERFORM eval IN PROGRAM (lv_prog)` | Regel-Engines im Kundencode | konstruiert | Code aus Daten | R13 Literal ≠ Code; K06 Unknown | jede statische Antwort ist Annahme; Security; Pflichtprüfung | kritisch |
| KA-063 | `INSERT REPORT lv_name FROM lt_src.` | abapGit `zcl_abapgit_sap_report` (ohne Zeile) | erinnert | Repository-Write per Statement | kein UPDATE erkannt | Repository-Schreiben; Cloud unmöglich; D-nah | hoch |
| KA-064 | `REUSE_ALV_GRID_DISPLAY … i_callback_user_command = 'USER_COMMAND'` + `FORM user_command` | ALV-Praxis | verifiziert (FM) | FORM-Name im Literal | R13: kein Aufruf → FORM unerreichbar | Callback durch Framework; erreichbarer Knoten mit Benutzerereignis | hoch |
| KA-065 | `SET HANDLER lo_h->on_double_click FOR lo_grid.` (`cl_gui_alv_grid`) | ALV-Praxis | verifiziert (Klasse) | Ereignisregistrierung | Methode ohne Aufrufer | Handler über Ereignis erreichbar; Ereignisknoten | mittel |
| KA-066 | `AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_kunnr.` + `F4IF_INT_TABLE_VALUE_REQUEST` | Reports | verifiziert (FM) | Eventblock ohne Aufrufer | nicht modelliert | Benutzerereignis vor START-OF-SELECTION | mittel |
| KA-067 | `POPUP_TO_CONFIRM … IMPORTING answer = lv. IF lv = '1'.` | Dialogprogramme | verifiziert (FM) | echte Benutzerentscheidung | opak + Gateway auf Variable | Gateway ist menschliche Entscheidung; R19 darf sie nicht wegnormieren | hoch |
| KA-068 | `AT LINE-SELECTION.` + `HIDE` + `sy-lisel` | Altreports | konstruiert | interaktive Liste | nichts | Benutzerereignis; HIDE = versteckter Zustand | mittel |
| KA-069 | `MESSAGE e001(zz) WITH lv.` in Report / PAI / Batch / RFC | überall | konstruiert | Terminierungssemantik | end oder nichts | kontextabhängig: Listende / Screen bleibt / Jobabbruch / Exception | hoch |
| KA-070 | `MESSAGE s001(zz) DISPLAY LIKE 'E'.` | überall | konstruiert | sieht wie Fehler aus | end? | kein Abbruch; Fachsatz „Fehler stoppt" falsch | mittel |
| KA-071 | `MESSAGE e001(zz) INTO lv_dummy.` | überall | konstruiert | keine Ausgabe | end? | nur Text; keine Terminierung | mittel |
| KA-072 | `cl_gui_frontend_services=>gui_download( )` / `GUI_UPLOAD` | Reports | verifiziert | Frontend-Datei | Katalog | B klassisch; not_usable; bewusst kein Backend-Nachfolger | mittel |
| KA-073 | `CREATE OBJECT lo_xl 'Excel.Application'. CALL METHOD OF lo_xl 'Workbooks' = lo_wb.` (OLE) | Altcode | verifiziert (Syntax) | OLE-Syntax ≈ dynamisches CREATE OBJECT | „dynamische Klasse unbekannt" | OLE-Automation am Frontend; kein ABAP-Objekt | hoch |
| KA-074 | `OPEN DATASET lv FOR OUTPUT IN TEXT MODE ENCODING DEFAULT. TRANSFER … CLOSE DATASET.` | Schnittstellen | konstruiert | Dateisystem | nichts | Appserver-Datei, B, Cloud nein; fehlende S_DATASET-Prüfung → Security | mittel |
| KA-075 | `SXPG_COMMAND_EXECUTE` / `CALL 'SYSTEM' ID 'COMMAND' FIELD lv` | Basis-Tools | verifiziert (FM/Syntax) | OS-Befehl | statisch B / Kernel Unknown | Security-kritisch; Level-Feld kann das nicht ausdrücken | hoch |
| KA-076 | `SORT lt BY bukrs kunnr. LOOP AT lt. AT NEW kunnr. … ENDAT.` | FI-Reports | konstruiert | Kontrollstufe = alle linken Felder | Gateway „neuer kunnr" | Gateway „neue Kombination bukrs+kunnr"; abhängig von Sortierung | hoch |
| KA-077 | `AT END OF kunnr. SUM. WRITE lt-name1.` | Reports | konstruiert | Felder rechts = `*` | Ausgabe Name | Name ist mit `*` gefüllt; SUM nur numerisch | mittel |
| KA-078 | `ON CHANGE OF lv_x.` | Altcode | konstruiert | obsolet, globales Gedächtnis | Gateway | Zustand über Aufrufe; nicht in Cloud | mittel |
| KA-079 | `LOOP AT lt ASSIGNING <fs>. … APPEND ls TO lt. ENDLOOP.` | Kundencode | konstruiert | Mutation beim Iterieren | loop | angehängte Zeilen werden mitverarbeitet → Endlosschleifenrisiko | mittel |
| KA-080 | `READ TABLE lt WITH KEY kunnr = lv BINARY SEARCH.` ohne SORT | Kundencode | konstruiert | undefiniertes Ergebnis | Fachsatz „findet Satz" | nicht belegbar; Befund | mittel |
| KA-081 | `lo->do_x( ). IF sy-subrc = 0.` (Methode setzt sy-subrc nicht) | Kundencode | konstruiert | veralteter sy-subrc | Gateway auf Methodenergebnis | Gateway wertet früheren SELECT aus; Anker muss Setzer nennen | hoch |
| KA-082 | `AT SELECTION-SCREEN. CHECK p_x IS NOT INITIAL. MESSAGE e001.` | Reports | konstruiert | CHECK im Eventblock | „Programmende" | verlässt nur Eventblock; Selektionsbild bleibt | mittel |
| KA-083 | `GET kna1. CHECK kna1-land1 = 'DE'.` (LDB) | LDB-Reports | konstruiert | CHECK in GET | Programmende | Satz verworfen, nächster GET | mittel |
| KA-084 | `START-OF-SELECTION. … STOP.` + `END-OF-SELECTION. WRITE 'X'.` | Reports | konstruiert | STOP ≠ Ende | end | STOP springt zu END-OF-SELECTION; EXIT beendet Eventblock; LEAVE PROGRAM alles | hoch |
| KA-085 | `PERFORM save_log ON COMMIT.` | Kundencode | konstruiert | aufgeschoben, einmalig | opak an Stelle | Ausführung beim COMMIT WORK; Mehrfachregistrierung einmal; keine Parameter | hoch |
| KA-086 | `UPDATE ztab … WAIT UP TO 1 SECONDS. … ROLLBACK WORK.` | Kundencode | konstruiert | impliziter DB-Commit | Rollback macht rückgängig | WAIT committet; ROLLBACK wirkungslos; Fachsatz falsch | hoch |
| KA-087 | `COMMIT WORK` in `LOOP AT lt_orders` | Massenverarbeitung | konstruiert | LUW pro Zeile | transaction | Teilfehler hinterlassen partielle Daten; „alles oder nichts" falsch | mittel |
| KA-088 | `ROLLBACK WORK.` nach `CALL FUNCTION … IN UPDATE TASK` | Kundencode | konstruiert | Registrierung verworfen | transaction | Update-Aufträge verworfen; interne Tabellen unverändert | mittel |
| KA-089 | `ENQUEUE_EZKNA1 … EXCEPTIONS foreign_lock = 1.` / `DEQUEUE_EZKNA1` | Sperrobjekt-Konvention | konstruiert | Sperre als Guard | opak + Gateway | Sperre; Nachfolger RAP-Locking; Dequeue-Pfad bei Exception | mittel |
| KA-090 | `AUTHORITY-CHECK OBJECT 'F_KNA1_BUK' ID 'BUKRS' FIELD lv ID 'ACTVT' FIELD '03'. IF sy-subrc <> 0.` | überall | verifiziert (Objekt) | keine Regel im Korpus | nichts | Berechtigungsgateway; CDS+DCL-Migration ändert Semantik; eigene Aussageklasse | kritisch |
| KA-091 | `AUTHORITY-CHECK …` ohne sy-subrc-Auswertung | Kundencode | konstruiert | wirkungslose Prüfung | nichts | Befund „Prüfung ohne Wirkung" | mittel |
| KA-092 | `MESSAGE e001 RAISING not_found.` vs. `RAISE EXCEPTION TYPE zcx` vs. `RAISE not_found` | FM-Code | konstruiert | drei Mechanismen | end | Aufrufer bestimmt Wirkung (Exception/Terminierung/sy-subrc) | mittel |
| KA-093 | `CATCH cx_root ##NO_HANDLER.` (leer) | abapGit (RC-036) | verifiziert | verschluckter Fehler | „Fehler behandelt" | stiller Fehlerpfad; Fachsatz „ignoriert" | mittel |
| KA-094 | `CLASS-METHODS class_constructor.` mit `SELECT SINGLE FROM t000` | Kundencode | konstruiert | versteckter Erstzugriff | nichts (kein Aufrufer) | läuft bei erstem Zugriff; read-Befund; Startknoten | mittel |
| KA-095 | `RAISE EVENT changed.` + `SET HANDLER` | Kundencode | konstruiert | ereignisgetrieben | Handler unerreichbar | synchron beim RAISE; Registrierung statisch auflösbar | mittel |
| KA-096 | `ASSIGN ('(SAPMV45A)VBAK-VBELN') TO <fs>.` in Z-Klasse/-FM | SD-Exit-Praxis | erinnert | Zugriff auf SAP-Programm-Interna | R15 Unknown (wie CC-020) | Abhängigkeit auf SAPMV45A via Literal; lesend nicht unterstützt, schreibend D-äquivalent | kritisch |
| KA-097 | `EXPORT lt TO MEMORY ID 'ZK'` (A) + `SUBMIT zprog_b AND RETURN` + `IMPORT … FROM MEMORY ID 'ZK'` (B) | Kundencode | konstruiert | programmübergreifender Datenfluss | Memory als Seiteneffekt | Kopplungskante A→B im Skelett | mittel |
| KA-098 | `cl_abap_typedescr=>describe_by_name( 'KNA1' )` / `CREATE DATA lr TYPE ('KNA1')` | Kundencode | konstruiert | Typname im Literal | R13 nichts; R15 released → B | DDIC-Abhängigkeit KNA1 (C-relevant) | hoch |
| KA-099 | `DATA lv_amt TYPE c LENGTH 15. IF lv_amt > 10000.` | Kundencode | konstruiert | Zeichen/Zahl-Vergleich | numerisches Gateway | Laufzeitkonversion; formatierte Eingabe → Dump | mittel |
| KA-100 | `IF ls_vbak-netwr > 10000.` bei WAERS JPY (TCURX) | FI/SD | konstruiert | Währungsdezimalen | Grenzwert 10000 | interner Wert verschoben; Grenzwert nur EUR-semantisch gültig | hoch |
| KA-101 | `lv_pct = lv_a * 100 / lv_b.` mit `TYPE i` | Kundencode | konstruiert | kaufmännische Rundung bei i | „Prozent" | rundet, trunkiert nicht | mittel |
| KA-102 | `PARAMETERS p_kunnr TYPE c LENGTH 10.` + `WHERE kunnr = @p_kunnr` (CC-002, CC-023) | Korpus selbst | verifiziert | fehlende ALPHA-Konvertierung | B01/B02 „Kunde wird gelesen/geändert" | nur bei zehnstelliger Eingabe mit führenden Nullen; Fachsätze bedingt | hoch |
| KA-103 | Klasse mit Sprachversion „ABAP for Cloud Development" + `SELECT FROM kna1` | Kundencode | konstruiert | Sprachversion fehlt in Fällen | C | Syntaxfehler im Zielkontext; §4 nennt Sprachversion, kein Fall liefert sie | mittel |
| KA-104 | Tier-2-Wrapper `ZCL_API_CUSTOMER_NAME` (released, C1) ruft `BAPI_CUSTOMER_GETDETAIL2`; Konsument nutzt nur Wrapper | SAP-3-Tier-Modell | verifiziert (BAPI, Modell) | Level nicht transitiv | R03 B / known_worst aus Wrapper | Konsument Tier 1 (A) bei freigegebenem Vertrag; Feld „release contract" fehlt | kritisch |
| KA-105 | RAP-Verhaltensimplementierung `zbp_i_zorder` mit `SELECT SINGLE FROM kna1` | Kundencode | konstruiert | moderne Schale | C für die Zeile | C; Aggregation auf RAP-Objekt; „modern" ist kein Level | mittel |
| KA-106 | `cl_salv_table=>factory( )` | Reports | verifiziert | OO-ALV wirkt modern | Katalog B | B; not_usable; Nachfolger Fiori/RAP-UI, kein Drop-in | mittel |
| KA-107 | `cl_http_client=>create_by_destination` + `if_http_client` | Schnittstellen | verifiziert | klassischer HTTP-Client | Katalog | B; Nachfolger `cl_web_http_client_manager`; kein Drop-in | mittel |
| KA-108 | `CALL FUNCTION 'READ_TEXT'` | überall | verifiziert | Langtexte | Katalog | B; „kein Nachfolger im Katalog" vs. „unbekannt" trennen; entscheidungsrelevant | hoch |
| KA-109 | `CALL FUNCTION 'NUMBER_GET_NEXT'` | überall | verifiziert | Nummernkreis | Katalog | B; Nachfolger `cl_numberrange_runtime`; Puffersemantik prüfen | mittel |
| KA-110 | `CALL FUNCTION 'BAL_LOG_CREATE'` | überall | verifiziert | Anwendungslog | Katalog | B; Nachfolger `cl_bali_log`; kein Drop-in | mittel |
| KA-111 | `CALL FUNCTION 'CONVERT_TO_LOCAL_CURRENCY'` | FI | verifiziert | Umrechnung | Katalog | B; Nachfolger (erinnert: `cl_exchange_rates`); Rundung prüfen | mittel |
| KA-112 | `CALL FUNCTION 'RFC_READ_TABLE' DESTINATION lv` | Schnittstellen | verifiziert | generisches Remote-Lesen | statisch B | Security + generischer Tabellenzugriff; Zielsystem | mittel |
| KA-113 | `TEST-SEAM db_read. SELECT … FROM kna1 … END-TEST-SEAM.` + `TEST-INJECTION` | Kundencode | konstruiert | Seam = Produktivcode | Lexer bricht evtl. | Produktivbefund innerhalb Seam; Injektion nur Test-Include | mittel |
| KA-114 | `CLASS ltcl DEFINITION FOR TESTING …` mit `SELECT FROM kna1` im `setup` | Kundencode | konstruiert | Testinclude | C wie Produktivcode | Befund mit Scope „test"; Aggregation getrennt | mittel |
| KA-115 | `INHERITING FROM cl_ci_test_scan` | abapOpenChecks (ohne Zeile) | erinnert | Vererbung von SAP-Klasse | R14/R16 „Vorfahr fehlt" | Abhängigkeit auf nicht freigegebene SAP-Klasse; Redefinition = enge Kopplung; Level strittig | hoch |
| KA-116 | `LOOP AT SCREEN. screen-input = 0. MODIFY SCREEN. ENDLOOP.` | Dynpro-Praxis | konstruiert | MODIFY-Keyword | DB-Write? | Dynpro-Attribut; kein DB | hoch |
| KA-117 | `SUBMIT zrep VIA JOB lv NUMBER lv_cnt AND RETURN` + `JOB_OPEN`/`JOB_CLOSE` | Kundencode | verifiziert (FMs) | Jobplanung | opak | asynchroner Hintergrundprozess; Nachfolger BPF | mittel |
| KA-118 | `cl_bcs=>create_persistent( )` / `SO_NEW_DOCUMENT_ATT_SEND_API1` | Kundencode | verifiziert | Mailversand | Katalog | externer Seiteneffekt; Nachfolger `cl_bcs_mail_message` | mittel |
| KA-119 | `CATCH SYSTEM-EXCEPTIONS conversion_errors = 1. … ENDCATCH.` | Altcode | konstruiert | obsoleter Catch | Parser? | Fehlerpfad-Gateway; Cloud nein | mittel |
| KA-120 | `REPORT z. NODES: kna1. GET kna1. WRITE kna1-kunnr.` (LDB) | LDB-Reports | verifiziert (Mechanik) / erinnert (LDB DDF) | Lesen ohne SELECT | kein R01-Befund → B | KNA1-Lesen via LDB → C; Selektionsbild aus LDB; Kontrollfluss invertiert | kritisch |
| KA-121 | `IF sy-uname = 'ADMIN'.` / `IF sy-sysid = 'PRD'.` | Kundencode | konstruiert | hartcodierte Umgebung | Gateway | Gateway mit Umgebungsabhängigkeit; Security | mittel |
| KA-122 | `CALL FUNCTION 'DB_COMMIT'.` | Kundencode | verifiziert | DB-Commit ohne COMMIT WORK | opak | transaction-Knoten (DB-LUW-Ende ohne V1) | mittel |

# 3. Die zehn wichtigsten Fälle ausgeschrieben

## 3.1 KA-096 — `ASSIGN ('(SAPMV45A)…')`: Zugriff auf SAP-Programm-Interna über ein Literal

*Herkunft:* SD-Exit-Praxis; das Muster wird verwendet, wenn eine BAdI-Methode oder ein aus SAPMV45A gerufener Funktionsbaustein Felder braucht, die die Schnittstelle nicht liefert. Beleggrad `erinnert`, Code nachgebaut.

```abap
CLASS zcl_sd_route_check IMPLEMENTATION.
  METHOD check_and_mark.
    FIELD-SYMBOLS: <lv_vbeln> TYPE any,
                   <lt_xvbap> TYPE ANY TABLE,
                   <lv_zzrt>  TYPE any.
    DATA lv_name TYPE string.

    lv_name = '(SAPMV45A)VBAK-VBELN'.
    ASSIGN (lv_name) TO <lv_vbeln>.
    IF sy-subrc <> 0.
      RETURN.                                   " nicht im Kontext von VA01/VA02
    ENDIF.

    ASSIGN ('(SAPMV45A)XVBAP[]') TO <lt_xvbap>.
    IF <lt_xvbap> IS ASSIGNED AND lines( <lt_xvbap> ) > 50.
      MESSAGE e001(zsd) WITH <lv_vbeln>.        " Terminierung kontextabhängig
    ENDIF.

    ASSIGN ('(SAPMV45A)VBAK-ZZ_ROUTE') TO <lv_zzrt>.
    IF sy-subrc = 0.
      <lv_zzrt> = 'MANAGER_ROUTE'.              " schreibt in SAP-Programmglobals
    ENDIF.
  ENDMETHOD.
ENDCLASS.
```

**Sollantwort:** Drei Befunde. (1) Abhängigkeit auf das SAP-Programm SAPMV45A und die Strukturen VBAK/XVBAP — die Abhängigkeit steht ausschließlich im Literal. (2) Lesezugriff auf nicht unterstützte Programminterna: klassisch mindestens „nicht unterstützt", Cloud not_usable. (3) Schreibzugriff auf `VBAK-ZZ_ROUTE` in fremdem Programmspeicher: D-äquivalent (wirkt wie Modifikation der Verarbeitung). `known_worst = D`, `complete = false` (Kontext SAPMV45A nicht geliefert). Skelett: Gateway „im Kontext von SAPMV45A?" mit RETURN-Pfad; MESSAGE E ist kontextabhängiges Ende.

**Warum der Korpus scheitert:** CC-020 lehrt „dynamischer ASSIGN → Unknown". R13 lehrt „Literal ist keine Abhängigkeit". Zusammen ergibt das für diesen Code *Unknown ohne Objektabhängigkeit* — und damit weder das Programm SAPMV45A als Repository-Objekt noch den Schreibzugriff. Ein Kunde würde diese Klasse als „dynamischen Code, nachträglich zu klären" einordnen statt als härtesten Kopplungsfall seines SD-Bestands.

## 3.2 KA-018 — ADBC: SQL im Stringliteral wird ausgeführt

*Herkunft:* Kundencode („Massenkorrektur"-Klassen). Beleggrad `konstruiert`.

```abap
CLASS zcl_mass_fix IMPLEMENTATION.
  METHOD fix_name.
    DATA lv_sql  TYPE string.
    DATA lo_stmt TYPE REF TO cl_sql_statement.

    lv_sql = |UPDATE KNA1 SET NAME1 = '{ iv_name }' | &&
             |WHERE MANDT = '{ sy-mandt }' AND KUNNR = '{ iv_kunnr }'|.
    TRY.
        CREATE OBJECT lo_stmt.
        DATA(lv_rows) = lo_stmt->execute_update( lv_sql ).
        IF lv_rows = 0.
          RAISE EXCEPTION TYPE zcx_not_found.
        ENDIF.
        COMMIT WORK.
      CATCH cx_sql_exception INTO DATA(lx_sql).
        ROLLBACK WORK.
        RAISE EXCEPTION TYPE zcx_db_error EXPORTING previous = lx_sql.
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
```

**Sollantwort:** R02-Befund D auf KNA1 (write), verankert am `execute_update`-Aufruf mit Sekundäranker auf der Template-Zeile; Objekt `CL_SQL_STATEMENT` (nicht released); Security-Befund SQL-Injektion (Template ohne Escaping); Nachfolger: keiner (I_Customer ist Lesemodell); Cloud not_usable. Skelett: write → Gateway `lv_rows = 0` → Exception-Ende; CATCH-Pfad mit Rollback.

**Warum der Korpus scheitert:** CC-016 Zeile 6 (`` `CALL 'C_SAPGPARAM'; UPDATE KNA1;` ``) ist als Negativkontrolle exakt dieser Text — mit dem Vertrag „kein UPDATE melden". Der Korpus enthält keinen Positivfall, der das Literal an einen Interpreter (ADBC, `EXEC SQL`, `GENERATE`) bindet. Eine Engine, die CC-016 besteht und nichts anderes gelernt hat, vergibt hier Level B mit null Befunden.

## 3.3 KA-053 / KA-052 — Modifikationsmarker und User-Exit-Include

*Herkunft:* Modifikationsassistent (Marker-Syntax verifiziert), SD-Include MV45AFZZ (Existenz verifiziert). Code nachgebaut.

```abap
*----------------------------------------------------------------------*
*  (a) Ausschnitt eines mit dem Modifikationsassistenten geänderten
*      SAP-Includes — Marker sind Kommentare, aber Beweis der Modifikation
*----------------------------------------------------------------------*
  IF ls_vbak-auart = 'TA'.
*{   INSERT         DEVK900123                                        1
    IF ls_vbak-netwr > 20000.
      ls_vbak-zz_review = 'Y'.
    ENDIF.
*}   INSERT
  ENDIF.

*----------------------------------------------------------------------*
*  (b) Kunden-Include MV45AFZZ im SAP-Programm SAPMV45A
*----------------------------------------------------------------------*
FORM userexit_save_document_prepare.
  DATA lv_review TYPE c LENGTH 1.
  IF vbak-netwr > 20000.
    lv_review = 'Y'.
    EXPORT review FROM lv_review TO MEMORY ID 'ZSD_REVIEW'.
  ENDIF.
ENDFORM.
```

**Sollantwort:** (a) D mit Begründung „Modifikation von SAP-Code", verankert am Markerpaar; Schwere über implizitem Enhancement (CC-010). (b) D durch Kontext SAPMV45A; der Kontext ist hier **ohne Metadaten** aus dem Include-Namen MV45AFZZ und dem FORM-Namen ableitbar (SAP-Namenskonvention der Kunden-Includes); `vbak` ist implizite Abhängigkeit auf das Hostprogramm-Global; ABAP-Memory als Seiteneffekt.

**Warum der Korpus scheitert:** CC-010 stellt die These auf „D gilt durch Kontext, nicht durch Code" und verlangt für D ein Host-Fixture. Beide realen Fälle tragen den Kontext *im Code* (Marker bzw. Namenskonvention). Ein Werkzeug, das CC-010 wörtlich nimmt, vergibt hier B — und ein Kunde plant seine SD-Exits als „Standard-ABAP, Level B".

## 3.4 KA-104 — Tier-2-Wrapper: Level ist nicht transitiv

*Herkunft:* SAP-Drei-Ebenen-Erweiterungsmodell (dokumentiert), BAPI existiert. Feldnamen im Code sind konstruiert.

```abap
" Tier 2 — kundeneigener Wrapper, in ADT mit Release-Vertrag C1 freigegeben
CLASS zcl_api_customer_name DEFINITION PUBLIC FINAL CREATE PRIVATE.
  PUBLIC SECTION.
    CLASS-METHODS get IMPORTING iv_kunnr TYPE kunnr RETURNING VALUE(rv_name) TYPE string.
ENDCLASS.
CLASS zcl_api_customer_name IMPLEMENTATION.
  METHOD get.
    CALL FUNCTION 'BAPI_CUSTOMER_GETDETAIL2'
      EXPORTING customerno            = iv_kunnr
      IMPORTING customergeneraldetail = DATA(ls_general).
    rv_name = ls_general-name.
  ENDMETHOD.
ENDCLASS.

" Tier 1 — Konsument, Sprachversion ABAP for Cloud Development
CLASS zcl_route_service IMPLEMENTATION.
  METHOD determine.
    DATA(lv_name) = zcl_api_customer_name=>get( iv_kunnr ).
    rv_route = COND #( WHEN iv_amount > 10000 THEN 'MANAGER_ROUTE' ELSE 'AUTO_ROUTE' ).
  ENDMETHOD.
ENDCLASS.
```

**Sollantwort:** Wrapper: B (klassischer BAPI-Aufruf), Cloud-API der BAPI not_usable, aber `release_contract = C1` als eigenes Feld. Konsument: **A** (nur freigegebene Objekte, inklusive freigegebener kundeneigener Wrapper), `known_worst` darf **nicht** aus dem Wrapper hochgereicht werden — die Kapselung ist der Zweck des Modells.

**Warum der Korpus scheitert:** R16 propagiert `known_worst` über fehlende oder kundeneigene Abhängigkeiten; R03 kennt für kundeneigene Objekte nur „B im Bestandsscope". Ein Feld für den Release-Vertrag kundeneigener Objekte existiert nicht. Damit kann der Korpus die zentrale Architekturentscheidung eines Clean-Core-Programms (Wrapper ja/nein) nicht bewerten und würde die Wrapper-Strategie als „bringt nichts, Level bleibt B" bewerten.

## 3.5 KA-086 — Impliziter Datenbank-Commit macht ROLLBACK wirkungslos

*Herkunft:* Kundencode. Beleggrad `konstruiert`; die Semantik von `WAIT UP TO` und RFC-Aufrufen als implizitem DB-Commit ist SAP-dokumentiert.

```abap
FORM update_and_notify.
  UPDATE zcc_decision SET route = 'MANAGER_ROUTE' WHERE case_id = gv_case.
  IF sy-subrc <> 0.
    ROLLBACK WORK.
    RETURN.
  ENDIF.

  CALL FUNCTION 'Z_NOTIFY_MANAGER' DESTINATION 'NONE'   " impliziter DB-Commit
    EXPORTING  iv_case               = gv_case
    EXCEPTIONS communication_failure = 1
               system_failure        = 2.
  IF sy-subrc <> 0.
    ROLLBACK WORK.                                      " kommt zu spät
    MESSAGE s010(zcc) DISPLAY LIKE 'E'.                 " kein Abbruch
    RETURN.
  ENDIF.

  WAIT UP TO 1 SECONDS.                                 " zweiter impliziter Commit
  COMMIT WORK.
ENDFORM.
```

**Sollantwort:** Skelett mit **drei** transaction-Knoten: impliziter Commit am RFC-Aufruf, impliziter Commit am WAIT, expliziter COMMIT. Der zweite ROLLBACK ist ein Befund („wirkungslos, UPDATE bereits festgeschrieben"). Fachsatz: „Bei Benachrichtigungsfehler bleibt die Route trotz Rollback gespeichert." MESSAGE S DISPLAY LIKE 'E' terminiert nicht.

**Warum der Korpus scheitert:** CC-023/CC-024 modellieren `transaction` nur für explizite COMMIT/ROLLBACK-Statements; R19 fordert „Transaktionsabsicht erhalten", kennt aber keine implizite LUW-Grenze. Eine Transformation, die den Code nach RAP überführt, würde die (falsche) Absicht „Rollback bei Fehler" umsetzen — und das Verhalten ändern.

## 3.6 KA-120 — Logische Datenbank: Lesen ohne SELECT

*Herkunft:* LDB-Reports (Mechanik verifiziert; LDB-Name DDF für Debitoren `erinnert`).

```abap
REPORT zcc_ldb_customers.          " Programmattribut: logische Datenbank DDF
NODES: kna1, knb1.
PARAMETERS p_land TYPE land1 DEFAULT 'DE'.

START-OF-SELECTION.

GET kna1.
  CHECK kna1-land1 = p_land.       " verwirft nur diesen Satz
  WRITE: / kna1-kunnr, kna1-name1.

GET knb1.
  WRITE: /5 knb1-bukrs, knb1-akont.

GET kna1 LATE.
  ULINE.

END-OF-SELECTION.
  WRITE / 'DONE'.
```

**Sollantwort:** R01-Befunde auf KNA1 und KNB1 (C), Anker an `NODES:` und je `GET`-Ereignis; Abhängigkeit auf die LDB (SAP-Objekt, nicht released, Cloud not_usable); Selektionsbild stammt aus der LDB (nicht im Quelltext). Skelett: LDB ist Treiber; `GET`-Blöcke sind Ereignisse pro Satz, `GET … LATE` nach Kindsätzen; `CHECK` verwirft nur den aktuellen Satz.

**Warum der Korpus scheitert:** R01 ist an `SELECT` gebunden. Dieser Report enthält kein SELECT, keine Klasse, keinen FM — nach dem endlichen Regelvertrag „keine Findings", also B. Der Report liest aber zwei Stammdatentabellen und ist in ABAP Cloud unmöglich.

## 3.7 KA-062 — `GENERATE SUBROUTINE POOL`: Daten werden Code

*Herkunft:* Regel-Engines in Kundencode. Beleggrad `konstruiert`.

```abap
METHOD evaluate_rule.
  DATA lt_src  TYPE STANDARD TABLE OF string.
  DATA lv_prog TYPE syrepid.
  DATA lv_msg  TYPE string.

  SELECT SINGLE rule_code FROM zcc_rules
    WHERE rule_id = @iv_rule INTO @DATA(lv_code).
  " lv_code z.B.: IF iv_amount > 10000. cv_route = 'MANAGER'. ENDIF.

  APPEND 'PROGRAM zgen.'                                            TO lt_src.
  APPEND 'FORM eval USING iv_amount TYPE p CHANGING cv_route TYPE string.' TO lt_src.
  APPEND lv_code                                                    TO lt_src.
  APPEND 'ENDFORM.'                                                 TO lt_src.

  GENERATE SUBROUTINE POOL lt_src NAME lv_prog MESSAGE lv_msg.
  IF sy-subrc <> 0.
    RAISE EXCEPTION TYPE zcx_rule_error.
  ENDIF.
  PERFORM eval IN PROGRAM (lv_prog) USING iv_amount CHANGING rv_route.
ENDMETHOD.
```

**Sollantwort:** Level Unknown mit **Pflichtbefund** „Codegenerierung aus Datenbankinhalt": Der Regelinhalt ist nicht statisch analysierbar; jede A–D-Aussage über die Fachregel ist eine Annahme. Security-Befund (Code aus Tabelle). Cloud not_usable (Statement nicht verfügbar). Skelett: Gateway `sy-subrc <> 0` → Exception; der PERFORM ist opak mit Vermerk „Ziel zur Laufzeit erzeugt". Fachsatz: „Die Routingregel steht in ZCC_RULES, nicht im Programm."

**Warum der Korpus scheitert:** CC-012 deckt `PERFORM (x) IN PROGRAM (y)` als „unbekanntes externes Ziel" — hier ist das Ziel nicht extern, sondern *aus Daten erzeugt*; R13 würde die vier String-Zeilen als Textliteral abtun. Kein Fall bindet Literal an Codeerzeugung. Ein Kunde erhielte „dynamischer PERFORM, Allowlist" statt „Ihre Geschäftsregel steht in einer Tabelle".

## 3.8 KA-028 / KA-029 — LEFT OUTER JOIN mit `IS NULL`: die CC-008-Regel kehrt sich um

*Herkunft:* Kundencode („Kunden ohne Vertriebsbereich"). Beleggrad `konstruiert`.

```abap
REPORT zcc_no_salesarea.
PARAMETERS p_bukrs TYPE bukrs DEFAULT '1000'.
START-OF-SELECTION.
  SELECT a~kunnr, a~name1, b~bukrs, c~vkorg
    FROM kna1 AS a
    INNER JOIN knb1 AS b ON b~kunnr = a~kunnr
    LEFT OUTER JOIN knvv AS c ON c~kunnr = a~kunnr
    WHERE b~bukrs = @p_bukrs
      AND ( c~vkorg IS NULL OR c~vkorg = @space )
    INTO TABLE @DATA(lt_rows).
  LOOP AT lt_rows INTO DATA(ls_row).
    WRITE: / ls_row-kunnr, ls_row-name1, 'NO_SALES_AREA'.
  ENDLOOP.
```

**Sollantwort:** Drei R01-Befunde (C). R08: Der WHERE-Filter auf der rechten Tabelle **behält** genau die NULL-Zeilen und ist die Fachlogik (Anti-Join). Fachsatz: „Ausgegeben werden Kunden des Buchungskreises ohne Vertriebsbereichssatz." Prüfvektor: Kunde mit KNB1-Satz und ohne KNVV → 1 Zeile; mit KNVV → 0 Zeilen. Nachfolger-Hinweis: Ein CDS-Ersatz muss NULL-Semantik der Assoziation erhalten.

**Warum der Korpus scheitert:** CC-008 F04 formuliert als Regel „WHERE-Bedingung auf rechter Tabelle verwirft NULL-Company-Treffer". Wörtlich angewandt liefert das hier exakt den umgekehrten Fachsatz. Die Regel ist als Prädikatanalyse (IS NULL / OR) zu fassen, nicht als „WHERE auf rechter Tabelle".

## 3.9 KA-090 / KA-091 — `AUTHORITY-CHECK`: die fehlende Aussageklasse

*Herkunft:* überall; Berechtigungsobjekt F_KNA1_BUK existiert. Code nachgebaut.

```abap
FORM read_customers USING iv_bukrs TYPE bukrs CHANGING ct_rows TYPE ty_t_rows.
  AUTHORITY-CHECK OBJECT 'F_KNA1_BUK'
    ID 'BUKRS' FIELD iv_bukrs
    ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    MESSAGE e002(zcc) WITH iv_bukrs.          " Ende — kontextabhängig
  ENDIF.

  SELECT a~kunnr, a~name1, b~bukrs
    FROM kna1 AS a
    INNER JOIN knb1 AS b ON b~kunnr = a~kunnr
    WHERE b~bukrs = @iv_bukrs
    INTO TABLE @ct_rows.

  AUTHORITY-CHECK OBJECT 'F_KNA1_GEN'
    ID 'ACTVT' FIELD '03'.
  " sy-subrc wird nicht ausgewertet
ENDFORM.
```

**Sollantwort:** Berechtigungsgateway auf F_KNA1_BUK vor dem Lesen (Skelettknoten `authorization`); zweiter Check ohne Wirkung → Befund; R01-Befunde C mit Handarbeit „Berechtigungsprüfung bei Umstieg auf I_Customer/I_CustomerCompany: DCL prüft auf Zeilenebene, nicht per Buchungskreis-Abbruch — Verhalten ändert sich (Filterung statt Fehlermeldung)". MESSAGE E: kontextabhängiges Ende.

**Warum der Korpus scheitert:** Kein Fall, keine Regel, kein Knotentyp für Berechtigung. CC-001-W02 erwähnt „Berechtigungsunterschiede" als Handarbeit, aber der Korpus kann nicht prüfen, ob eine Engine einen AUTHORITY-CHECK überhaupt sieht. Für einen Kunden ist der Unterschied „Abbruch mit Fehlermeldung" vs. „stille Filterung" eine Compliance-Entscheidung.

## 3.10 KA-059 — Batch-Input auf eine Transaktion, die es in S/4HANA nicht mehr gibt

*Herkunft:* Batch-Input-Praxis; XD01 → BP in S/4HANA ist bekannt; Dynpro-Nummern/Feldnamen sind konstruiert.

```abap
FORM create_customer_bdc USING is_cust TYPE zcc_cust.
  DATA: lt_bdc TYPE STANDARD TABLE OF bdcdata,
        lt_msg TYPE STANDARD TABLE OF bdcmsgcoll.

  PERFORM bdc_dynpro USING 'SAPMF02D' '0100'.
  PERFORM bdc_field  USING 'RF02D-KUNNR' is_cust-kunnr.
  PERFORM bdc_field  USING 'RF02D-BUKRS' is_cust-bukrs.
  PERFORM bdc_field  USING 'BDC_OKCODE'  '/00'.
  PERFORM bdc_dynpro USING 'SAPMF02D' '0110'.
  PERFORM bdc_field  USING 'KNA1-NAME1'  is_cust-name1.
  PERFORM bdc_field  USING 'BDC_OKCODE'  '=UPDA'.

  CALL TRANSACTION 'XD01' USING lt_bdc MODE 'N' UPDATE 'S' MESSAGES INTO lt_msg.

  READ TABLE lt_msg WITH KEY msgtyp = 'E' TRANSPORTING NO FIELDS.
  IF sy-subrc = 0.
    PERFORM write_error USING lt_msg.
  ENDIF.
ENDFORM.
```

**Sollantwort:** Abhängigkeit auf Transaktion XD01, Programm SAPMF02D, Dynpros 0100/0110, Feldnamen — alle in Literalen. Klassisch: „nicht unterstützt, bricht bei UI-Änderung"; im S/4-Zielkontext: XD01 existiert nicht mehr (Weiterleitung BP) → Ausführung scheitert. Cloud not_usable. Nachfolger: Business-Partner-API (keine Drop-in-Kompatibilität). Skelett: opaker Transaktionsaufruf mit Rückgabetabelle, Gateway auf Fehlermeldungen; das Schreiben von KNA1 geschieht **im** Aufruf, nicht sichtbar.

**Warum der Korpus scheitert:** Kein K-Fall für `CALL TRANSACTION`; R13 blendet alle Abhängigkeiten aus, weil sie als Literale in den `bdc_field`-Aufrufen stehen. Der endliche Regelvertrag liefert „keine Findings" — für den Kunden ein Programm, das im Zielsystem gar nicht läuft.

# 4. Systematische Lücken

**L1 — R13 ist einseitig: Literal wird Code oder Abhängigkeit.** Treffer: KA-018, 017, 062, 063, 064, 096, 098, 035, 059, 060 (10 Fälle, 5 kritisch). Änderung: R13 in zwei Regeln spalten — „Literal ohne Konsument ist kein Statement" und „Literal mit Konsument (ADBC, EXEC SQL, GENERATE, ASSIGN (…), RTTI describe_by_name, CREATE DATA TYPE (…), Callback-Parameter, BDC-Felder, CALL TRANSACTION) ist Abhängigkeit". Für jede Konsumentenklasse einen Positivfall; CC-016 bleibt als Negativkontrolle, braucht aber ein Gegenstück.

**L2 — DDIC-Abhängigkeiten außerhalb von SQL.** Treffer: KA-008, 009, 010, 011, 012, 014, 098, 120 (8). Änderung: R01 auf Typreferenzen (`TYPE kna1`, `INCLUDE STRUCTURE`, `SELECT-OPTIONS FOR`, `TABLES`, `NODES`) erweitern; Nachfolger auf Strukturebene sind eigene Objekte (Datenelemente, released Strukturen) und nicht identisch mit CDS-Lesemodellen.

**L3 — Hostkontext ist oft syntaktisch/namentlich erkennbar.** Treffer: KA-051, 052, 053, 054, 055, 057, 115 (7, 2 kritisch). Änderung: CC-010 („D nur durch Kontext") ergänzen um Fälle mit Marker-Syntax, `ENHANCEMENT…ENDENHANCEMENT`, `CALL CUSTOMER-FUNCTION`, SAP-Kunden-Include-Namensraum (MV45AFZZ, ZX*), `IF_EX_*`; KA-055 als Gegenprobe gegen Keyword-Überreaktion.

**L4 — LUW- und Transaktionssemantik.** Treffer: KA-023, 031, 032, 040, 042, 045, 061, 085, 086, 087, 088, 122 (12). Änderung: Knotentyp `transaction` um implizite Commits (RFC, WAIT, CALL SCREEN/TRANSACTION, LEAVE TO TRANSACTION), Update-Task-Aufschub, ON COMMIT, DB_COMMIT erweitern; Fachsätze über „Rollback" nur mit Belegen, dass kein impliziter Commit dazwischenliegt.

**L5 — Laufzeitkontext des Kontrollflusses.** Treffer: KA-069, 070, 071, 082, 083, 084, 076, 077, 078, 081, 092, 094, 095, 065, 066, 068, 083 (17). Änderung: Skelettvertrag braucht (a) den Laufzeitkontext (Report/Dialog/Batch/RFC) als Pflichtfeld für MESSAGE-Semantik, (b) Ereignisblöcke (`AT SELECTION-SCREEN`, `GET`, `AT LINE-SELECTION`, Handler, class_constructor) als Startknoten, (c) `STOP`/`EXIT`/`CHECK`/`REJECT` mit Zielangabe, (d) Kontrollstufen als zusammengesetzte Gateways, (e) Anker für den **Setzer** von sy-subrc.

**L6 — Berechtigung und Sicherheit als eigene Aussageklasse.** Treffer: KA-015, 016, 021, 033, 074, 075, 090, 091, 112, 121 (10, 3 kritisch). Änderung: Das A–D-Level kann „unsicher" nicht ausdrücken. Eigene Facette `security_and_authorization` mit Knotentyp `authorization`, Befundtyp „generischer Datenzugriff", „DCL umgangen", „Prüfung ohne Wirkung".

**L7 — Release-Vertrag kundeneigener Objekte / Tier-Modell.** Treffer: KA-104, 105, 103, 020 (4, 1 kritisch). Änderung: Feld `release_contract` (C0/C1/none) für kundeneigene Objekte; `known_worst` stoppt an freigegebenen Wrappern; Sprachversion je Objekt als Pflichtfeld (der Vertrag §4 verlangt sie, kein Fall liefert sie).

**L8 — Zielmengen zwischen Singleton und Unknown.** Treffer: KA-038, 039, 048, 049, 056 (5). Änderung: R07 um „Zielmenge > 1" und „familiengebundene Menge" (Namensmuster) erweitern; Comparator muss Listen von Zielen und Muster akzeptieren.

**L9 — UI-Automatisierung und Frontend.** Treffer: KA-058, 059, 060, 064, 067, 072, 073, 106, 116 (9, 1 kritisch). Änderung: Konstruktklasse für `CALL TRANSACTION USING`, `SUBMIT`, OLE, GUI-Dateien, Callbacks; `MODIFY SCREEN` als Negativkontrolle gegen R02.

**L10 — Ankeridentität.** Treffer: KA-001, 002, 003, 004, 005, 006, 007 (7). Änderung: Der Ankervertrag ist innerhalb des Korpus nicht einheitlich (CC-007). Statement-ID + Tokenoffset als Primäridentität; Makroexpansion und Kettensätze als Fälle.

**L11 — Nachfolger-Statusbegriffe für häufige Bausteine.** Treffer: KA-108, 109, 110, 111, 118, 107 (6). Kein Widerspruch zur Mechanik, aber der Korpus enthält für die zehn meistgenutzten SAP-Bausteine im Kundencode keinen einzigen Vektor; die Entscheidungswirkung von „kein Nachfolger" (READ_TEXT) ist unbewertet.

# 5. Was ich am Korpus nicht widerlegen konnte

- **R04 (CL_HTTP_UTILITY: classicAPI + notToBeReleased → klassisch B).** Konsistent mit dem zitierten SAP-Blog; ich habe keinen Gegenfall gefunden, bei dem diese Kombination klassisch anders zu werten wäre.
- **R06 (CONSTANTS ist statisch).** Entspricht der ABAP-Schlüsselwortdokumentation. KA-038/039 erweitern R07, widersprechen R06 nicht.
- **R17 (TADIR-Identität vs. objectType, 0/1/n/unknown).** Der Vier-Felder-Vertrag ist tragfähig; meine Nachfolgerfälle (L11) brauchen ihn genau so.
- **CC-016 als Negativkontrolle** ist für sich richtig; der Mangel liegt im fehlenden Positivgegenstück (L1), nicht in CC-016.
- **CC-017 (Dispatch, super, negative Beträge vor Super)** — korrekt.
- **K11-Unknown-Disziplin** (CC-012, 014, 018, 020, 021, 022): Die Weigerung, fehlende Quellen zu erfinden, ist richtig; KA-019 bestätigt sie.
- **R09-Grundaussage** (kein Leerschutz ohne Guard behaupten) hält; KA-026/027 verfeinern, widerlegen nicht.

**Wo der Korpus selbst irrt (unabhängig von Abdeckung):**
- **CC-002/CC-023 (KA-102):** `PARAMETERS p_kunnr TYPE c LENGTH 10` erhält keine ALPHA-Konvertierung. Die Fachsätze B01/B02 („Kunde wird gelesen/geändert") gelten nur für zehnstellige Eingaben mit führenden Nullen; die Prüfvektoren fehlen. Der Korpus hat damit im eigenen Kernfall eine unbelegte Fachaussage.
- **CC-008 F04** ist als Regelsatz falsch formuliert (KA-028/029); richtig ist eine Prädikataussage.
- **CC-013 F01** wird an Zeile 1 (`PROGRAM`) verankert, CC-007 F04 an einen Bereich, CC-001 F01 an die FROM-Zeile: drei Ankerkonventionen. Eine Engine, die konsistent am Statementbeginn ankert, wird vom Comparator an mindestens einem dieser Fälle abgelehnt.
- **`cloud_view = not_applicable`** für Reports mit `WRITE`/`PARAMETERS` (CC-003, CC-016, CC-017, CC-025) ist irreführend: Kein REPORT ist in ABAP Cloud aktivierbar. Das Feld soll API-Oberfläche meinen, wird aber je Fall gelesen.
- **CC-012** modelliert `PERFORM (p_form) IN PROGRAM (p_prog) IF FOUND` als „nicht gefunden oder normale Rückkehr". Das Laden des Fremdprogramms führt dessen `LOAD-OF-PROGRAM` aus — ein Seiteneffekt vor dem FORM. Ob `IF FOUND` auch ein fehlendes **Programm** abdeckt, konnte ich nicht sicher aus der Erinnerung belegen; das gehört als Prüferfrage in den Fall.

**Wo die Härtungsstudie sich irrt oder überzieht:**
1. Sie schließt aus abapGit/abap2xlsx auf „Vorkommensabdeckung" und leitet daraus RV-026–039 ab. Beide Projekte enthalten weder Geschäftsdatenzugriff noch Berechtigung, LUW, Exit noch UI-Automatisierung. Die 14 Erweiterungen decken keine der hier als kritisch eingestuften Klassen. Die Studie nennt in §10.3 die richtigen Strata, liefert aber keinen einzigen Fall daraus.
2. „561 von 561 Assertions" sind zu einem großen Teil triviale Negativmerkmale (`CALL_FUNCTION = 0` in Methoden ohne CALL FUNCTION). Das ist keine Belastung der Regeln R01–R24, sondern ein Lexer-Test; die Zahl suggeriert Regelabdeckung, die nicht stattfand.
3. RC-005 (`UPDATE seoclassdf`) wird als „Schreiboperation belegbar, Klassifikation braucht Metadaten" geführt — richtig; aber die Studie zieht daraus nicht die naheliegende Konsequenz, dass R02 in ihrer 103er-Menge nur einmal überhaupt aktiv wurde. R01 wurde ausschließlich mit Repository-Tabellen (SEOCLASS, REPOSRC, D010TINF …) belastet, deren Klassifikation im Kundenkontext irrelevant ist.
4. RC-023: Die Studie nennt `ASSERT` einen „Schutz vor leerer FAE-Eingabe". Ein ASSERT ohne ID ist in Produktion ein Kurzdump. Das ist kein Guard im Sinne von R09 (Verhinderung des Statements mit definiertem Weiterlauf), sondern ein Abbruchpfad; die Studie sagt das selbst, sollte aber R09 nicht als „erfüllt" zählen.

# 6. Freigabeempfehlung

**Nicht freigeben** — als Ground Truth für reale Programme. Als versionierte Mechanik- und Regressionsfixture-Sammlung für den Comparator (mit der Härtung 1.0.1) ist der Stand nutzbar, aber das ist ein anderes Artefakt als das, was der Titel „Referenzkorpus" verspricht.

Begründung: Erstens würde eine Engine, die alle 25 Fälle und die 103 Realmethoden besteht, ein KNA1-Update per ADBC, einen LDB-Report, ein Batch-Input auf XD01 und eine `ASSIGN ('(SAPMV45A)…')`-Klasse mit Level B und null Befunden durchlassen — das sind Kundenentscheidungen mit Schaden. Zweitens fehlen dem Vertrag zwei Aussageklassen (Berechtigung/Sicherheit, Release-Vertrag kundeneigener Objekte), ohne die A–D für Architekturentscheidungen nicht tragfähig ist. Drittens enthält der Korpus in seinen eigenen Kernfällen unbelegte Fachsätze (ALPHA in CC-002/CC-023), eine falsch formulierte Regel (CC-008 F04) und uneinheitliche Ankerkonventionen.

**Auflagen für den nächsten Kandidaten (1.1):**
1. R13 zweiteilen und je Konsumentenklasse (ADBC, EXEC SQL, GENERATE, ASSIGN (…), RTTI-Name, Callback, BDC/CALL TRANSACTION) einen Positivfall mit Sollbefund aufnehmen.
2. Neue Aussageklasse `security_and_authorization` mit Knotentyp `authorization` und mindestens fünf Fällen (AUTHORITY-CHECK mit/ohne Auswertung, PRIVILEGED ACCESS, generischer Tabellenzugriff, OS-Befehl).
3. Feld `release_contract` für kundeneigene Objekte; Tier-2-Wrapper-Fall mit Konsument; Sprachversion als Pflichtfeld je Datei.
4. `transaction`-Knoten um implizite Commits, Update-Task-Aufschub und ON COMMIT erweitern; CC-023/CC-024 um einen Fall mit RFC/WAIT ergänzen.
5. Skelettvertrag: Laufzeitkontext als Pflichtfeld; Ereignisblöcke, STOP/EXIT/CHECK mit Zielangabe, Kontrollstufen, sy-subrc-Setzer-Anker.
6. R01 auf Typabhängigkeiten und LDB (`NODES`/`GET`) erweitern; CC-008 F04 als Prädikatregel neu fassen.
7. Ankervertrag vereinheitlichen (Statement-ID + Tokenoffset); CC-007/CC-013 entsprechend korrigieren.
8. ALPHA-Prüfvektoren für CC-002/CC-023 ergänzen oder Fachsätze bedingt formulieren.
9. Realcode-Sampling aus mindestens drei Fachanwendungen (FI/SD/MM-Exits, Dialogprogramme, Schnittstellen) mit Projekt-Holdout; nicht weitere Methoden aus Werkzeugprojekten.
10. Alle hier als `erinnert`/`konstruiert` gekennzeichneten Fälle vor Aufnahme durch einen zweiten Prüfer syntaktisch aktivieren lassen; keine Übernahme meiner Sollantworten ohne Gegenzeichnung.