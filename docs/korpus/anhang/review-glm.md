# 1. Urteil

Der Korpus v1 hält als Ground Truth für reale Programme **nicht** stand. Er ist ein ehrlich dokumentierter Kandidat mit sauberen Trennungen (proposed oracle, Unknown-Zustände, Trennung Classic/Cloud), aber seine 25 Fälle sind zu klein, zu glatt und zu sehr auf die elf Konstruktklassen zugeschnitten, um die Wirklichkeit kundeneigener SAP-Landschaften auch nur anzunähern. Die bisherige Härtungsstudie hat das im Prinzip richtig erkannt, aber ihre eigene Stichprobe (103 Methoden aus zwei Open-Source-Projekten) ist selbst zu eng: Sie prüft überwiegend lexikalische Merkmale, nicht die eigentlichen Sollantworten des Korpus (Level, Nachfolger, Fachsätze, Skelette).

Der schwerwiegendste Einzelmangel, den ich gefunden habe: **Der Korpus hat kein einziges Fallpaar, in dem derselbe Code in zwei verschiedenen Zielkontexten unterschiedliche richtige Antworten hat** — und genau das ist im Kundenalltag der Normalfall (dasselbe `SELECT * FROM mara` ist in einem On-Premise-ERP mit freigegebenem Lesezugriff etwas anderes als in einem BTP-ABAP-Environment-Ziel). Meine Fälle A-004/A-005/A-020 zeigen, dass jede feste Sollantwort ohne Zielkontext-Parameter keine Ground Truth, sondern eine Annahme ist. Zweitenschwerstes Problem: Der Prozessskelett-Vertrag scheitert an Ereignisblöcken (`AT NEW`, `START-OF-SELECTION`-Schachtelung, `CALL FUNCTION ... IN UPDATE TASK`, RFC-Callbacks), weil dort die Ausführungsreihenfolge statisch prinzipiell nicht rekonstruierbar ist — der Korpus modelliert das nicht, sondern tut so, sequentieller Quelltext entspräche sequentiellem Prozess.

# 2. Die Fälle

Hinweis zur Herkunft: Ich habe keinen Netzwerkzugang und führe nichts aus. „Konstruiert“ bedeutet: Muster, das ich aus jahrelanger Arbeit mit produktiven SAP-Kundensystemen und öffentlichen Projekten nachgebaut habe; die konkrete Fundstelle ist keine belegbare Quelle. „Erinnert“ bedeutet: Ich halte die Stelle für real, kann sie nicht belegen. Kein einziger Fall ist mit einer URL belegt; das ist Absicht.

| ID | ABAP-Konstrukt | Herkunft | Beleggrad | Angriffspunkt | Was der Korpus sagen würde | Was richtig wäre | Schwere |
|---|---|---|---|---|---|---|---|
| A-001 | `SELECT ... ENDSELECT`-Schleife über VBAK | Kunden-EW-Report | konstruiert | K01 kennt nur `INTO TABLE`; zeilenweise Selektion ohne Finding | Kein oder falsches Finding (Statement wird als Block gelesen) | Finding auf VBAK-Lesen + Schleifenknoten im Skelett | hoch |
| A-002 | `SELECT SINGLE` ohne `WHERE`-Eindeutigkeit (nur BUKRS) | Kopfauftrag-Check | konstruiert | R01 sagt nichts über Selektivität; Fachsatz „liest genau einen Kunden“ wäre unbelegt | C-Finding, implizit „ein Satz“ | C-Finding, aber Fachsatz darf Kardinalität nicht behaupten | mittel |
| A-003 | `SELECT COUNT(*) FROM vbap WHERE ...` | Existenzprüfung | konstruiert | Zähloperation ist kein „Lesezugriff mit Projektion“; Nachfolger-Empfehlung (I_SalesOrderItem) für COUNT semantisch anders | C mit I_...-Nachfolger | C, aber Nachfolger nur mit Vorbehalt (Aggregation vs. Zeilenmodell) | mittel |
| A-004 | `SELECT * FROM mara` On-Premise, Release-objekt freigegeben | Materialliste | konstruiert | Zielkontext fehlt im Korpus als Parameter; dieselbe Zeile hat je Ziel andere richtige Antwort | Festes C unter Fixture-Profil | Antwort muss von Edition/Release abhängen; Korpus braucht Kontextpaar | kritisch |
| A-005 | `SELECT * FROM mara` identisch, Ziel ABAP Cloud | wie A-004 | konstruiert | Gegenstück zu A-004 | Festes C | In Cloud-Kontext D-äquivalent/nicht kompilierbar; Korpus kann das nicht ausdrücken | kritisch |
| A-006 | `OPEN CURSOR`/`FETCH`/`CLOSE` Paketlesen | Massenupdate | konstruiert | K01/K04 decken Cursor nicht ab | Unbekannt/kein Finding | Explizite Paketsemantik; Skelett braucht Cursor-Schleife | hoch |
| A-007 | `EXEC SQL`/`ENDEXEC` Natives SQL auf Oracle-DDIC | Legacy-Interface | erinnert | K08 (Kernel) ist nicht Native SQL; Korpus hat keine Klasse dafür | Vermutlich kein Finding | Eigene Kategorie: Native SQL umgeht DDIC + Berechtigungen; mindestens D-Kandidat | kritisch |
| A-008 | `EXEC SQL ... CONNECT TO lv_dbs` (secondary connection) | Konsolidierung | konstruiert | Externe DB-Verbindung; ADO/AMDP-Nachfolger strittig | Nicht abgedeckt | D-Kandidat + explizite Betriebsabhängigkeit | hoch |
| A-009 | `AMDP`-Klasse mit `BY DATABASE PROCEDURE` | Modernisierung | konstruiert | Sieht nach Clean Code aus; in ABAP Cloud nur mit Freigabe, klassisch B | Korpus kennt AMDP nicht | B mit AMDP-spezifischen Vorbehalten (DB-Abhängigkeit) | hoch |
| A-010 | CDS-View mit `DEFINE VIEW` auf Z-Tabelle, konsumiert von Report | Eigenes DDIC | konstruiert | Nachfolger-Konzept: eigene CDS ist kein „SAP-Nachfolger“; R17 passt nicht | Nachfolgerliste leer, not_applicable | Richtig wäre: Eigenes Artefakt, aber Cloud-Deployment-Status der CDS separat bewerten | mittel |
| A-011 | `CALL TRANSACTION 'VA01'` mit BDC-Table | Auftragsanlage | konstruiert | K07 deckt Dynpro im eigenen Programm, nicht Fremdtransaktion | Vermutlich R11 B | B, aber Skelett ist opak (Screens von VA01 unbekannt); Korpus hat keinen „fremde Transaktion“-Fall | hoch |
| A-012 | `CALL TRANSACTION ... AND SKIP FIRST SCREEN` | Navigation | konstruiert | Erstes Screen übersprungen — Skelett-Annahme „PAI durchlaufen“ falsch | B, opak | B, aber Skelett muss Skip explizit modellieren | mittel |
| A-013 | `SUBMIT zreport AND RETURN` mit `EXPORTING LIST TO MEMORY` | Vorlaufprogramm | konstruiert | Fremdprogramm + Listmemory; K11 deckt fehlende Quelle, nicht Rückgabekopplung | Unknown, opak | Unknown + explizite Datenkopplung über SAP-Memory/Listmemory als Seiteneffektklasse | hoch |
| A-014 | `SUBMIT ... VIA SELECTION-SCREEN` mit `USING SELECTION-SET` | Variantenstart | konstruiert | Varianteninhalt ist Customizing, nicht Code | Unknown | Unknown + Hinweis, dass Fachlogik von Customizing abhängt | mittel |
| A-015 | `EXPORT itab TO MEMORY ID 'ZFOO'` + `SUBMIT` | Session-Kopplung | konstruiert | Härtungsstudie hat Memory erwähnt, Korpus hat keinen Fall | Nicht abgedeckt | Seiteneffektklasse Memory; Skelett braucht zwei Prozesse | hoch |
| A-016 | `IMPORT lv_x FROM MEMORY ID 'ZFOO'` ohne vorheriges EXPORT im Slice | Include-Kette | konstruiert | K11 (fehlende Quelle) deckt Include, nicht Memory-Herkunft | Kein Finding | Unknown: Wert kann aus beliebigem Programm stammen | hoch |
| A-017 | `CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'` ohne `BAPI_TRANSACTION_COMMIT` | Fehlgeschlagene Anlage | konstruiert | BAPI ohne Commit = keine persistente Anlage; Fachsatz „legt Auftrag an“ wäre falsch | B, classicAPI-Finding | B + verpflichtender Fachsatz: ohne Commit bleibt LUW offen | kritisch |
| A-018 | `CALL FUNCTION ... IN UPDATE TASK` + `COMMIT WORK` (ohne AND WAIT) | V1-Verbuchung | konstruiert | Skelett: UPDATE-Task läuft asynchron nach COMMIT; statische Reihenfolge unauflösbar | R19 würde sequentiell modellieren | Asynchroner Knoten; COMMIT ≠ ausgeführte Verbuchung | kritisch |
| A-019 | `COMMIT WORK` gefolgt von `SELECT` auf die geänderte Tabelle | Konsistenzprüfung | konstruiert | Ohne AND WAIT kann das SELECT den alten Stand lesen | Skelett: sequentiell | Race-Condition-Klasse; Korpus hat kein Nebenläufigkeitskonzept | kritisch |
| A-020 | `SET UPDATE TASK LOCAL` vor Verbuchung | Testmodus | konstruiert | Lokale Verbuchung ändert Commit-Semantik | Nicht abgedeckt | Eigener Fachsatz nötig | hoch |
| A-021 | `CALL FUNCTION 'RFC_READ_TABLE'` auf Zielsystem 'CRMCLNT100' | Systemkopplung | konstruiert | FM-Name statisch, Ziel dynamisch; R06/R07 behandeln nur Funktionsziel | B, statischer FM | B, aber Ziel-System ist eigene Unknown-Dimension | hoch |
| A-022 | `CALL FUNCTION ... DESTINATION lv_rfc` mit `lv_rfc` aus Customizing-Tabelle | RFC-Dispatcher | konstruiert | Datenfluss auflösbar nur mit Tabelleninhalt | R07: dynamisch, Datenfluss offen | Unknown mit Begründung „Customizing-abhängig“ | hoch |
| A-023 | `CALL FUNCTION ... STARTING NEW TASK ... DESTINATION` mit `PERFORMING recv ON END OF TASK` | asynchrones RFC | konstruiert | Callback-Form; Prozessskelett statisch nicht rekonstruierbar | Nicht abgedeckt | Explizit opak + asynchroner Rückkehrknoten | kritisch |
| A-024 | `WAIT UNTIL lv_done = 'X' UP TO 10 SECONDS` nach aRFC | Synchronisation | konstruiert | Warteschleife; Skelett braucht Zeitkonzept | Nicht abgedeckt | Timeout-Zweig modellieren | hoch |
| A-025 | `ENQUEUE/DEQUEUE`-Baustein `ENQUEUE_E_TABLE` mit generischem Argument | Sperren | konstruiert | Generisches Lockobjekt; R-Sicht „Lockabfrage ist keine Sperre“ (RC-Studie) gilt nicht für ENQUEUE | Vermutlich kein Finding | ENQUEUE erwirbt Sperre — Seiteneffekt | hoch |
| A-026 | `AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'` mit `DUMMY`-Feld | Berechtigung | konstruiert | Korpus hat keine Berechtigungsdimension überhaupt | Kein Finding | Eigene Aussageklasse; Clean-Core betrifft das nicht direkt, aber Fachsätze tun es | mittel |
| A-027 | `LOOP AT itab AT NEW kunnr ... ENDAT` | Klassischer Report | konstruiert | AT NEW hängt von Tabellensortierung ab; Skelett ohne Sort-Abhängigkeit falsch | R19 sequentiell | Kontrollfluss abhängig von Datenzustand; Korpus kennt datenabhängige Verzweigung nicht | kritisch |
| A-028 | `LOOP ... AT END OF ... SUM.` | Zwischensummen | konstruiert | SUM nur innerhalb AT END OF gültig; Semantik datenabhängig | Nicht abgedeckt | Wie A-027 | hoch |
| A-029 | `SORT itab` zwischen `READ TABLE ... BINARY SEARCH` | Legacy-Pattern | konstruiert | Binary Search ohne Sort = Laufzeitfehler; Korpus prüft nicht Vorbedingungserfüllung | Kein Finding | Fachsatz: „liest effizient“ nur bei erhaltener Sortierung | mittel |
| A-030 | `LOOP AT SCREEN` in PBO-Modul | Dynpro | konstruiert | SCREEN ist Systemstruktur; K07-Fall CC-013 hat kein LOOP AT SCREEN | R11 B | B, aber Skelett braucht Screen-Iteration | niedrig |
| A-031 | `MODULE ... ON CHAIN-REQUEST` | Dynpro-Kette | konstruiert | K07 deckt INPUT/OUTPUT-Module, keine Chain-Semantik | R11 B | B, aber PAI-Auslösung nur bei Änderung | mittel |
| A-032 | `FIELD gv_x MODULE check_x.` im PAI | Dynpro-Feldbindung | konstruiert | Modul läuft nur bei Feldfehler erneut; Fehlermeldung hält Feld offen | R11 B | B, aber Skelett muss Feld-Transport-Modus abbilden | hoch |
| A-033 | `LEAVE TO TRANSACTION 'X'` | Navigation | konstruiert | Beendet Kontext ohne Rückkehr; Skelett-Endknoten anders als LEAVE TO SCREEN 0 | R11-artig | Ende ohne Rückkehr; Korpus unterscheidet das nicht | mittel |
| A-034 | `SUPPRESS DIALOG` in Dynpro | Verbuchungsdynpro | konstruiert | PBO unterdrückt Screen; Skelett ohne Screenmetadaten unvollständig | R11 | Unknown ohne Screenexport (wie CC-014) | mittel |
| A-035 | `DEFINE macro. ... END-OF-DEFINITION.` + Aufruf | Legacy-Include | konstruiert | Makro-Expansion: Zeilenanker zeigen Aufruf, Logik liegt in Definition; R13/Zeilenvertrag bricht | Findings an Aufrufzeile? | Anker auf Definition + Aufruf; Korpus hat keinen Makro-Fall | hoch |
| A-036 | Makro mit `CHECK` im Rumpf | Include-Bibliothek | konstruiert | CHECK im Makro wirkt im Aufrufer-Kontext; Skelett des Aufrufers ändert sich unsichtbar | Nicht abgedeckt | Kontextabhängige CHECK-Semantik; konfliktiert mit RV-027/028 | hoch |
| A-037 | `GENERATE SUBROUTINE POOL itab ...` + `PERFORM (form) IN PROGRAM` | dynamischer Code | konstruiert | Code entsteht zur Laufzeit aus Daten; jede statische Antwort ist Annahme | R07-artig Unknown | Unknown + explizit „Code ist Daten“; Korpus hat keinen Fall | kritisch |
| A-038 | `INSERT REPORT 'ZGEN...' FROM itab` | Code-Injektion | konstruiert | Erzeugt neues Repository-Objekt; D-Kandidat aus anderen Gründen als Tabellenwrite | Nicht abgedeckt | Eigene Kategorie; Security-Dimension | kritisch |
| A-039 | `READ REPORT 'ZPROG' INTO itab` + String-Manipulation | Selbstmodifikation | konstruiert | Quelltext als Daten (RC-Studie kennt das), aber Korpus nicht | Kein Finding | Kein DB-Write, aber Repository-Seiteneffekt bei Rückweg über INSERT REPORT | hoch |
| A-040 | `SELECT ... WHERE (lv_where)` dynamische WHERE-Clause | Selektionsbild-Builder | konstruiert | Tabelle statisch, Bedingung dynamisch; R07 kennt nur dynamische Ziele | C auf Tabelle, WHERE unbeachtet | C + SQL-Injection-Hinweis + Bedingung als Unknown | hoch |
| A-041 | `SELECT ... FROM (lv_tabname)` dynamische Tabelle, lv aus Select-Options | generisches Tool | konstruiert | FROM dynamisch: Zielmenge unbegrenzt; R01 (C) nicht anwendbar | Unknown vermutlich | Unknown + Sicherheitsprüfung; jede Level-Aussage ist Annahme | kritisch |
| A-042 | `DELETE FROM (lv_tabname) WHERE ...` | Aufräum-Job | konstruiert | Dynamischer DB-Delete; schlimmster Fall von R02 | R02 D? | D nur wenn SAP-Tabelle bewiesen; sonst Unknown mit Worst-Case-Markierung | kritisch |
| A-043 | `MODIFY ztab FROM TABLE itab.` (eigene Tabelle, MODIFY = Update+Insert) | Eigenes Logging | konstruiert | R20 kennt UPDATE auf eigene Tabelle; MODIFY-Insert-Semantik anders | R20-artig B | B, aber Fachsatz: legt fehlende Zeilen an (CC-024-B02 sagt explizit „legt keine an“ — Regelkonflikt) | hoch |
| A-044 | `UPDATE kna1 ... WHERE kunnr = ...` gefolgt von `ROLLBACK WORK` im Fehlerpfad | Korrekturlauf | konstruiert | R02 D-Finding bleibt richtig, aber Fachsatz „ändert Name“ nur im Commit-Fall | D + „ändert“ | D + Fachsatz muss LUW berücksichtigen | hoch |
| A-045 | `INSERT INTO kna1 ...` im Rahmen eines Custom-Stammdaten-Tools | Eigenes SD-Tool | konstruiert | Direktschreiben auf SAP-Tabelle; R02 deckt UPDATE, INSERT nicht explizit | R02 D vermutlich | D; R02-Text sollte INSERT/MODIFY/DELETE explizit nennen | hoch |
| A-046 | `SELECT ... FROM kna1 BYPASSING BUFFER` | Performance-Fix | konstruiert | BYPASSING BUFFER ändert Lesesemantik vs. CDS-Nachfolger (Pufferung) | C, Nachfolger I_CUSTOMER | C, aber drop_in_compatible noch weniger bewiesen (Pufferverhalten) | mittel |
| A-047 | `SELECT ... FOR ALL ENTRIES` mit Duplikaten in Treibertabelle | FAE-Falle | konstruiert | R09 kennt Leertabellen-Guard; Duplikat-Multiplikation nicht | Guard ok | Fachsatz: Duplikate multiplizieren Ergebnis; Korpus fehlt | mittel |
| A-048 | `SELECT ... UP TO 1 ROWS ... ORDER BY ...` | „letzter Satz“-Muster | konstruiert | UP TO + ORDER BY: Nachfolger-CDS muss ORDER BY garantieren | C | C + Vorbehalt bei Reihenfolge-Garantie | niedrig |
| A-049 | `SELECT ... INTO CORRESPONDING FIELDS OF ls_struc` | Legacy | konstruiert | Korrespondenz-Transfer; Nachfolger-Migration (CDS) mit Feldnamen-Mapping | C | C + Mapping-Arbeitspaket | niedrig |
| A-050 | Join über Cluster-/Pool-Tabelle (BSEG) mit FAE | FI-Report | konstruiert | BSEG ist Cluster-Tabelle; Joins darauf klassisch eingeschränkt; CDS-Nachfolger anders strukturiert | R08-artig | C + struktureller Vorbehalt (Cluster vs. transparent) | hoch |
| A-051 | `SELECT ... FROM vbfa` (Belegfluss) | Beleghistorie | konstruiert | VBFA hat keinen einfachen CDS-Äquivalent-Nachfolger; Nachfolgerliste leer mit welcher Begründung? | `not_listed`? | Status „existiert nicht im Katalog“ vs. „nicht erfasst“ muss geprüft werden, nicht gestipuliert | hoch |
| A-052 | `WRITE / sy-uline` + `FORMAT COLOR` + `TOP-OF-PAGE` | klassisches List-Reporting | konstruiert | K07 deckt Dynpro, nicht List-Writer; Clean-Core-Level strittig (B wie Dynpro?) | Nicht abgedeckt | B analog Dynpro; Korpus braucht Listen-Reporting-Fall | mittel |
| A-053 | `REUSE_ALV_GRID_DISPLAY` mit Callback-Form `USER_COMMAND` | ALV-Classic | konstruiert | Callback ist dynamischer PERFORM über I_CALLBACK_PROGRAM; R07-Falle | Vermutlich kein Finding | Dynamischer FORM-Name; Zielmenge aus Parameter auflösbar nur mit Konstante | hoch |
| A-054 | `SET PF-STATUS 'MAIN' EXCLUDING lt_fcodes` | Dynpro | konstruiert | Excluding-Liste datenabhängig; GUI-Status-Metadaten reichen nicht | R11 B | B, aber Funktionscode-Erreichbarkeit ist datenabhängig | mittel |
| A-055 | `MESSAGE e001(zfoo) RAISING not_found.` | Ausnahmebehandlung | konstruiert | MESSAGE RAISING: Exception nur wenn Caller abfängt, sonst Abbruch | R19 sequentiell | Zwei Ausgänge je Caller; Skelett des Fragments allein mehrdeutig | hoch |
| A-056 | `RAISE EXCEPTION TYPE zcx ... MESSAGE ID ...` mit `MESSAGE`-T100 | OO-Fehler | konstruiert | Unproblematisch, aber Korpus hat keinen Exception-Fall mit Fachsatz | Kein Finding | OK; aber Lücke: TRY/CATCH fehlt weiterhin als Fall | niedrig |
| A-057 | `TRY. ... CATCH cx_sy_open_sql_db INTO lx. ... CLEANUP. ... ENDTRY.` mit RESUME-fähiger Exception | Fehlerbehandlung | konstruiert | before-unwind vs. propagierend; CLEANUP-Fall RV-029 reicht nicht | RV-029 verwiesen | Zwei getrennte Fälle nötig (behandelbar vs. propagierend) | hoch |
| A-058 | `CATCH BEFORE UNWIND` | Resumable Handling | konstruiert | Kontext bleibt während Handler aktiv; Skelett anders | Nicht abgedeckt | Eigener Fall | hoch |
| A-059 | `RAISE RESUMABLE EXCEPTION` + `RESUME` | Resumable | konstruiert | Kontrolle kehrt an Wurfstelle zurück; Prozessgraph zyklisch über Methodengrenze | Nicht abgedeckt | Zyklischer Graph; Korpus-Graphvertrag prüft das nicht | hoch |
| A-060 | `CHECK` in `START-OF-SELECTION` (Report-Ebene) | Selektionsprüfung | konstruiert | CHECK verlässt Ereignisblock, nicht Programm; RV-027/028 decken DO/Methode, nicht Event | Nicht abgedeckt | Dritter CHECK-Kontext nötig | hoch |
| A-061 | `CHECK` in `AT SELECTION-SCREEN` | Selektionsbild | konstruiert | CHECK hier wirkt wie RETURN aus Event; PAI des Selektionsbilds wiederholt | Nicht abgedekt | Event-Wiederholung im Skelett | hoch |
| A-062 | `EXIT` in `AT NEW`-Block | Steuerung | konstruiert | EXIT verlässt LOOP, nicht AT-Gruppe; Feinheit der Schleifen-Semantik | R19 | LOOP-Exit; Korpus-Regeln unterscheiden EXIT-Ziele nicht systematisch | mittel |
| A-063 | `CONTINUE` in `DO ... WHILE`-Schachtelung | Parser-Falle | konstruiert | CONTINUE wirkt auf innerste Schleife | R19 | Innerste Schleife; braucht Statement-IDs (RC-096-Erkenntnis verallgemeinert) | mittel |
| A-064 | `WHILE` mit `sy-index`-Nutzung nach `CONTINUE` | Iteration | konstruiert | sy-index wird bei CONTINUE trotzdem inkrementiert | Nicht abgedeckt | Fachsatz über Zählerstand | niedrig |
| A-065 | `DO.` ohne `TIMES`/`VARYING` mit `EXIT` | Endlosschleifen-Muster | konstruiert | Skelett ohne Terminierungsbedingung | R19 | Loop mit Exit-Guard; Korpus verlangt Guards — hier ist Exit der Guard | mittel |
| A-066 | `ON CHANGE OF` | Legacy-Kontrollstruktur | konstruiert | Veraltete Struktur, datenabhängig wie AT NEW | Nicht abgedeckt | Wie A-027 | mittel |
| A-067 | `FIELD-GROUPS`/`INSERT ... INTO fs` (Datenextraktion) | Uralt-Report | erinnert | Extrakt-Reporting; praktisch tot, aber in Altbeständen real | Nicht abgedeckt | B/Unknown; Korpus behauptet keine Vollständigkeit — aber hier fehlt eine ganze Epoche | niedrig |
| A-068 | `PROVIDE ... FROM itab1 ... FROM itab2 ... BETWEEN ...` | HR-Zeitraum | konstruiert | PROVIDE über mehrere Tabellen; HR-typisch; Skelett komplex | Nicht abgedeckt | Eigener Kontrollflussknoten | hoch |
| A-069 | `GET pernr.` (Logical Database PNPCE) | HR-Payroll | konstruiert | LDB-Ereignis: Programmstruktur von LDB definiert; statische Rekonstruktion unmöglich ohne LDB | Nicht abgedeckt | Unknown + LDB als fehlende Abhängigkeit (K11-artig) | kritisch |
| A-070 | `NODES pernr.` + `GET pernr LATE.` | HR | konstruiert | LATE-Variante; Reihenfolge innerhalb LDB | Nicht abgedeckt | Wie A-069 | hoch |
| A-071 | `INFOTYPES 0000-0002.` | HR-Deklaration | konstruiert | Deklaration erzeugt implizit Tabellen + Lesezugriffe | Kein Finding | Implizite SELECTs; Korpus „Kommentare erzeugen keine Objekte“ hat kein Gegenstück für Deklarationen, die Zugriffe erzeugen | hoch |
| A-072 | `TABLES kna1.` + `SELECT-OPTIONS s_kunnr FOR kna1-kunnr.` | Standard-Selektionsbild | konstruiert | TABLES erzeugt Workarea; DDIC-Abhängigkeit ohne Statement-Ausführung | Kein Finding | DDIC-Abhängigkeit ja, Ausführung nein — Korpus trennt das nicht explizit | mittel |
| A-073 | `RANGES r_matnr FOR ...` + Verwendung in WHERE | Legacy-Select-Options | konstruiert | RANGES-Tabelle als WHERE-Operand; Semantik wie Select-Options | C-Finding auf Tabelle | C + Ranges-Semantik (inklusive/exklusive) | niedrig |
| A-074 | `PARAMETERS p_x AS LISTBOX ...` mit `VRM_SET_VALUES` | Dynpro-Select | konstruiert | Listbox-Werte aus Hilfstabelle; GUI-Metadaten reichen nicht | R11 B | B + Werteliste als Customizing-Abhängigkeit | mittel |
| A-075 | `INITIALIZATION.`-Block mit `PERFORM init_data` | Report | konstruiert | Reihenfolge INITIALIZATION → AT SELECTION-SCREEN → START-OF-SELECTION; Korpus-Skelette starten bei START-OF-SELECTION | Skelett startet falsch | Ereignisreihenfolge gehört ins Skelett | hoch |
| A-076 | `END-OF-SELECTION.` mit `WRITE` nach `STOP.`-Pfad | List-Ausgabe | konstruiert | STOP springt zu END-OF-SELECTION; Goto-artiger Sprung | R19 sequentiell | Expliziter Sprungknoten | hoch |
| A-077 | `AT LINE-SELECTION` + `READ LINE` | interaktives List-Reporting | konstruiert | Ereignis durch User-Klick; Skelett braucht Interaktion | Nicht abgedeckt | Wie Dynpro-PAI, aber List-Event | mittel |
| A-078 | `HIDE gv_key` + `AT LINE-SELECTION` | interaktive Liste | konstruiert | HIDE speichert versteckt Zeilendaten; Seiteneffekt ohne sichtbares Statement-Verhalten | Nicht abgedeckt | HIDE als versteckter Zustand | mittel |
| A-079 | `SET TITLEBAR`, `SET SCREEN`, `LEAVE SCREEN`-Kombination | Dynpro-Folge | konstruiert | SET SCREEN + LEAVE SCREEN = nächster Screen ohne PAI des aktuellen | R11 | Screen-Folge-Logik; Korpus hat nur CALL SCREEN/LEAVE TO SCREEN 0 | mittel |
| A-080 | `CALL SELECTION-SCREEN 1000` | Sub-Selektionsbild | konstruiert | Selektionsbild als Dialog | R11-artig | B; Korpus trennt Selektionsbild/Dynpro nicht | niedrig |
| A-081 | `GET BADI lo_badi FILTERS land = p_land` | gefiltertes BAdI | konstruiert | R24 kennt Aktivierung; Filter wählt Implementierungen datenabhängig | R24 B | B + Filter als datenabhängige Dispatch-Menge; Skelett mehrdeutig | hoch |
| A-082 | `CALL BADI lo_badi->meth ...` mit Mehrfachimplementierung (nicht single-use) | Multi-Use-BAdI | konstruiert | CC-009 ist single-use; Multi-Use ruft alle aktiven Implementierungen in undefinierter Reihenfolge | R24 | B + Reihenfolge undefiniert; Skelett braucht Multi-Instanz-Knoten | kritisch |
| A-083 | `cl_badi_utility=>...` / `GET BADI` mit Context-Objekt | BAdI-Kontext | konstruiert | Kontext-Objekt beeinflusst Auswahl | R24 | Unknown ohne Kontextquelle | hoch |
| A-084 | Enhancement-Implementierung `ENHANCEMENT 1 ZFOO. ... ENDENHANCEMENT.` in eigenem Z-Include | Explizite Erweiterung | konstruiert | Explizite (nicht implizite) Enhancement-Sektion in eigenem Code: R10 sagt D nur für implizite SAP-Host-Einfügung | R10 D? | B für eigenes Objekt; R10-Text ist zu eng gefasst | hoch |
| A-085 | `ASSIGN ('(SAPLZFOO)GV_X') TO <fs>` Feldsymbol auf fremdes Programm | Cross-Programm-Zugriff | konstruiert | Dynamischer Zugriff auf anderes Programm; Ziel ist Datenobjekt, nicht Methode | R07-artig | Unknown; Korpus behandelt nur dynamische Aufrufziele, nicht Datenobjekte | hoch |
| A-086 | `ASSIGN LOCAL COPY OF ...` | Kopie-Bindung | konstruiert | Schreibzugriff wirkt auf Kopie | Nicht abgedeckt | Fachsatz über Schreibwirkung | mittel |
| A-087 | `CREATE DATA dref TYPE STANDARD TABLE OF (lv_type)` | dynamischer Tabellentyp | konstruiert | CC-020 deckt Struktur; Tabellentyp + `CREATE OBJECT`-Kombination fehlt | R15 Unknown | Unknown, aber DDIC-Typname dynamisch | mittel |
| A-088 | `cl_abap_structdescr=>create(...)` + `cl_abap_typedescr=>describe_by_name( lv_name )` | RTTI dynamisch | konstruiert | describe_by_name mit Variable: Zieltyp unbekannt | R15 | Unknown; CC-019/020 decken describe_by_data, nicht by_name | hoch |
| A-089 | `CALL METHOD ('ZCL_FOO')=>('METH')` beide Teile dynamisch | Doppel-Dynamik | konstruiert | Klasse und Methode dynamisch; R07 kennt nur FM/PERFORM | Unknown vermutlich | Unknown; Korpus-Regelwerk hat keine OO-Dynamik-Regel | hoch |
| A-090 | `CALL METHOD lo_obj->('METH')` mit Interface-Referenz | Dispatch + Dynamik | konstruiert | Dynamischer Dispatch auf unbekannte Implementierungsklasse | R14? | Unknown; R14 (Vererbung) und R07 (Dynamik) konkurrieren | hoch |
| A-091 | `MOVE-CORRESPONDING` zwischen DDIC-Strukturen | Mapping | konstruiert | Unproblematisch, aber Fachsatz über Feldübernahme nur mit Namensgleichheit | Kein Finding | OK; Grenzfall für Fachsatz-Vertrag | niedrig |
| A-092 | `CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'` in ABAP-Cloud-Syntaxdatei (`LANGUAGE VERSION 5`) | Cloud-Quelle | konstruiert | CC-005 geht von Standard-ABAP aus; in Cloud-Quelle kompiliert das nicht — Level-Antwort anders | B | In Cloud-Kontext: Fehler/D; Korpus misst nur klassisch | kritisch |
| A-093 | `CALL 'RSEC_CHECK'`-artiger Kernelaufruf in altem Sicherheitscode | Kernel | erinnert | CC-015 ist der einzige Kernel-Fall; ein zweiter konkreter Kernel-Aufruf mit anderem Freigabestatus fehlt | R12 Unknown | Unknown, aber Korpus braucht mehr als einen Datenpunkt für K08 | hoch |
| A-094 | `CALL 'SYST_LOGOFF'` | Kernel | erinnert | Anderer Kernel-Aufruf, evtl. dokumentiert freigegeben | R12 Unknown pauschal | Je Aufruf unterschiedlich; pauschales Unknown ist zu grob | hoch |
| A-095 | `SYSTEM-CALL`-artige interne Aufrufe in SAP-eigenem kopierten Include | kopierter SAP-Code | konstruiert | Kunde kopiert SAP-Include; Eigentümer-Zuordnung (SAP vs. Kunde) mehrdeutig | R16? | Eigentümer mehrdeutig; Korpus hat keinen „kopierter SAP-Code“-Fall | hoch |
| A-096 | `INCLUDE LKEDFxxx`-artige SAP-Include-Nutzung | Include | erinnert | SAP-Include direkt inkludiert (nicht Z-Include wie CC-021) | K11 Unknown | Unknown, aber SAP-Abhängigkeit ≠ kundeneigene; R16 deckt das nicht | hoch |
| A-097 | `TYPE-POOLS: abap.` + `abap_bool` | Deklaration | konstruiert | TYPE-POOLS ist veraltet aber harmlos; Gefahr der Übermeldung | Kein Finding | Kein Finding; Negativkontrolle nötig | niedrig |
| A-098 | `STATICS lv_counter` in FORM | Zustand | konstruiert | FORM-lokaler statischer Zustand; Skelett über Aufrufe hinweg | Nicht abgedeckt | Zustandsknoten über Aufrufgrenzen | mittel |
| A-099 | `PERFORM form(TABLES itab)` mit `USING`-Referenzsemantik | FORM-Schnittstellen | konstruiert | CHANGING-Wirkung von USING bei Referenzübergabe | R19 | Fachsatz über Seiteneffekt; Korpus prüft FORM-Parameter nicht | mittel |
| A-100 | `CALL FUNCTION 'REUSE_ALV_FI...` deprecated FM mit dokumentiertem Nachfolger (CL_SALV_TABLE) | ALV-Migration | konstruiert | Nachfolger existiert und ist dokumentiert — anders als CL_HTTP_UTILITY-Fall | B + Nachfolger | B + Nachfolger CL_SALV; Korpus hat keinen Fall mit bekanntem, dokumentiertem Nachfolger außer CDS | mittel |
| A-101 | `WRITE lv_amount TO lv_str CURRENCY 'USD' DECIMALS 0` | Formatierung | konstruiert | RC-094-Erkenntnis, aber mit DECIMALS-Override: Formatierung weicht von Währungsstandard ab | Wie RC-094 | Fachsatz: Override der Währungsdezimalen | niedrig |
| A-102 | `SET COUNTRY 'US'` vor WRITE | Ländereinstellung | konstruiert | Globaler Formatierungszustand; Seiteneffekt auf alle Folgeausgaben | Nicht abgedeckt | Sitzungszustand wie ABAP-Memory-Klasse | mittel |
| A-103 | `CONVERT DATE ... INTO ...` + `WRITE ... USING EDIT MASK` | Datumsformat | konstruiert | EDIT MASK ist ausführbare Formatlogik in Ausgabestatement | Kein Finding | Formatierungslogik, kein Business-Effekt; Grenzfall R13 | niedrig |
| A-104 | `JOB_OPEN`/`SUBMIT ... VIA JOB`/`JOB_CLOSE` | Hintergrundverarbeitung | konstruiert | Skelett: Job läuft später in anderem Kontext; statische Reihenfolge sinnlos | Nicht abgedeckt | Asynchroner Prozess; Korpus-Skelett-Konzept bricht | kritisch |
| A-105 | `CALL FUNCTION 'ENQUEUE_READ'` + `WRITE` der Locks in Job-Log | Diagnose | konstruiert | Harmlos, aber Kombination aus RC-055-Muster + Event-Kontext | B | B; bestätigt RC-Studie, kein neuer Angriff — Negativkontrolle | niedrig |

# 3. Die zehn wichtigsten Fälle ausgeschrieben

## Fall 1 (A-018): `CALL FUNCTION ... IN UPDATE TASK` — das Skelett lügt

```abap
REPORT zupd_demo.
START-OF-SELECTION.
  DATA lv_kunnr TYPE kna1-kunnr VALUE '0000000001'.
  CALL FUNCTION 'Z_FI_UPDATE_CREDIT'
    IN UPDATE TASK
    EXPORTING iv_kunnr = lv_kunnr.
  WRITE / 'SCHEDULED'.
  COMMIT WORK.
  WRITE / 'COMMITTED'.
```

**Sollantwort (Kandidat):** B für den Bausteinaufruf (Z-FM, kundeneigen). Der Fachsatz darf nur lauten: „Die Verbuchung wird nach COMMIT WORK asynchron beauftragt“ — nicht „Das Kreditlimit ist aktualisiert“. Skelett: `SCHEDULED` und `COMMITTED` werden garantiert vor der eigentlichen Datenänderung ausgegeben; der Update-Task ist ein separater, zeitlich nicht festgelegter Prozessknoten.

**Warum der Korpus scheitert:** R19 („Kontrollfluss erhalten“) und der Skelett-Vertrag sind rein quelltext-sequenziell. Der Korpus hat kein Konzept für asynchrone Prozessteile. Ein Transformationstool, das den Korpus-Skeletten folgt, würde die Verbuchung als synchronen Schritt zwischen `SCHEDULED` und `COMMITTED` darstellen — ein realer Kunde träfe daraus die falsche Entscheidung, die Ausgabe `COMMITTED` bedeute Persistenz. Das ist der Grundtyp von A-019, A-023, A-104.

## Fall 2 (A-027): `AT NEW` — Kontrolle hängt von Daten ab, nicht vom Code

```abap
REPORT zatnew_demo.
START-OF-SELECTION.
  SELECT kunnr, bukrs, akont FROM knb1
    INTO TABLE @DATA(lt_b)
    ORDER BY kunnr, bukrs.
  LOOP AT lt_b INTO DATA(ls_b).
    AT NEW kunnr.
      WRITE: / 'Kunde', ls_b-kunnr.
    ENDAT.
    WRITE: / ls_b-bukrs, ls_b-akont.
  ENDLOOP.
```

**Sollantwort:** C-Finding auf KNB1 (R01). Skelett: Der `AT NEW`-Zweig wird nicht pro Iteration, sondern nur bei Gruppenwechsel durchlaufen — und Gruppenwechsel sind vom Tabelleninhalt abhängig, nicht vom Quelltext. Ohne `ORDER BY` wäre das Verhalten unbestimmt.

**Warum der Korpus scheitert:** Alle 25 Skelette haben Kantenbedingungen, die aus dem Quelltext ableitbar sind (`lt_customers IS INITIAL` etc.). Der Korpus hat keine Aussageklasse für „Kontrollfluss hängt von Datenwerten ab, die zur Analysezeit unbekannt sind“. R19 verlangt Kontrollfluss-Erhalt, kann aber nicht definieren, was hier erhalten werden muss. Dasselbe Muster: A-028, A-066, A-081, A-082.

## Fall 3 (A-041): Dynamisches `FROM (lv_tabname)` — jede Level-Aussage ist eine Annahme

```abap
REPORT zdyn_select.
PARAMETERS p_tab TYPE tabname16 DEFAULT 'KNA1'.
START-OF-SELECTION.
  SELECT * FROM (p_tab) INTO TABLE @DATA(lt_any)
    UP TO 100 ROWS.
  WRITE / lines( lt_any ).
```

**Sollantwort:** Kein C-Finding auf KNA1, obwohl der Default 'KNA1' ist. Das Ziel ist ein Selektionsbildparameter; die Zielmenge umfasst jede Tabellen des Systems. Korrekt: Unknown für das konkrete Zugriffsziel, mit Worst-Case-Markierung (kann D-Tabellen treffen), plus Sicherheitsbefund (keine Allowlist).

**Warum der Korpus scheitert:** R01 bindet das Finding an eine konkrete Tabelle im FROM. R07 behandelt dynamische Ziele nur für `CALL FUNCTION`/`PERFORM`. Der Korpus hat keinen einzigen Fall mit dynamischem SQL-Ziel — die Härtungsstudie hat das nicht bemängelt, obwohl RC-036 (dynamische Projektion bei statischem FROM) die halbe Falle zeigt. Ein Tool, das RC-036 korrekt behandelt, kann A-041 trotzdem falsch lösen, weil die Regel für FROM fehlt. Kritisch, weil Kunden genau solche „generischen Tabellen-Browser“-Reports haben.

## Fall 4 (A-017): BAPI ohne Commit — sieht nach Clean Core aus, ist aber fachlich unvollständig

```abap
REPORT zbapi_demo.
START-OF-SELECTION.
  DATA ls_hdr TYPE bapisdhd1.
  DATA lt_itm TYPE TABLE OF bapisditm.
  " ... Füllung von ls_hdr/lt_itm ...
  CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
    EXPORTING order_header_in = ls_hdr
    TABLES    return = DATA(lt_ret)
              order_items_in = lt_itm.
  IF line_exists( lt_ret[ type = 'E' ] ).
    WRITE / 'ERROR'.
  ELSE.
    WRITE / 'CREATED'.
  ENDIF.
```

**Sollantwort:** B (classicAPI-FM). Verpflichtender Fachsatz: Ohne `BAPI_TRANSACTION_COMMIT` bleibt die Anlage in der LUW und wird beim Programmende verworfen. `CREATED` ist eine berechnete Ausgabe, keine persistente Auftragsanlage (Analogie zu R18 „berechneter Status ist keine Genehmigung“ — aber der Korpus hat diesen Satz nicht für BAPIs).

**Warum der Korpus scheitert:** Das ist die umgekehrte Modernisierungsfalle: Der Code *sieht* sauber aus (BAPI statt Direktwrite, also kein D), aber die Fachlogik ist defekt bzw. unvollständig. Der Korpus prüft Clean-Core-Level, seine Fachsatz-Klasse könnte das tragen — tut es aber nicht, weil kein einziger der 64 Fachsätze eine LUW/Commit-Aussage enthält. CC-023 behandelt COMMIT nur als Transaktionsabschluss des Direktwrites.

## Fall 5 (A-035): Makro — der Zeilenanker-Vertrag bricht

```abap
REPORT zmacro_demo.
DEFINE _check_amount.
  IF &1 > &2.
    MESSAGE e001(zfoo) WITH &1.
  ENDIF.
END-OF-DEFINITION.
START-OF-SELECTION.
  DATA lv_amt TYPE p LENGTH 9 DECIMALS 2.
  _check_amount lv_amt 10000.
  WRITE / 'OK'.
```

**Sollantwort:** Das IF liegt lexikalisch in der Makrodefinition, wirkt aber zur Laufzeit an der Aufrufzeile mit den konkreten Argumenten. Ein Finding (z. B. Grenzwertprüfung) muss beide Anker tragen: Definition (Bedingung) und Aufruf (Bindung + Ausführungsort). Skelettknoten gehört an die Aufrufstelle.

**Warum der Korpus scheitert:** Der Zeilenvertrag (Abschnitt 6) geht von Statement-Position = Wirkungsort aus. Makros verletzen das. Die Härtungsstudie hat Makros explizit als „kein erfüllter Vertrag“ des Probes genannt, aber keinen Fall geliefert. Ein Engine, die Findings an die Definitionszeile hängt, besteht jeden Zeilenvergleich des Korpus und ist trotzdem für den Kunden unbrauchbar, weil die Grenzwertprüfung im Prozess an der falschen Stelle erscheint.

## Fall 6 (A-082): Multi-Use-BAdI — CC-009 verallgemeinert zu Unrecht

```abap
REPORT zbadi_multi.
DATA lo_badi TYPE REF TO zbadi_cc_calc.
START-OF-SELECTION.
  GET BADI lo_badi.
  DATA lv_result TYPE p LENGTH 9 DECIMALS 2.
  CALL BADI lo_badi->calc
    CHANGING cv_result = lv_result.
  WRITE / lv_result.
```

**Sollantwort:** Bei einem Multi-Use-BAdI werden *alle* aktiven Implementierungen in vom System gewählter Reihenfolge aufgerufen; jede kann `cv_result` überschreiben. Skelett: kein einzelner Implementierungszweig, sondern eine Sequenz unbekannter Länge und Reihenfolge. Fachsatz „das Ergebnis folgt der Regel X“ ist ohne Kenntnis aller Implementierungen unmöglich.

**Warum der Korpus scheitert:** CC-009 ist explizit Single-Use mit „genau einer aktiven Implementierung“ als Fixture-Annahme. R24 redet von „Einzelimplementierung“. Der Korpus verallgemeinert damit stillschweigend ein Muster, das in SAP-Standard-BAdIs (die überwiegend Multi-Use sind) selten ist. Ein Tool, das anhand von CC-009 lernt, würde hier genau eine Implementierung ins Skelett zeichnen.

## Fall 7 (A-069): `GET pernr` — der Prozess lebt in der Logical Database

```abap
REPORT zhr_ldb.
NODES pernr.
INFOTYPES 0000, 0001, 0002.
START-OF-SELECTION.
  GET pernr.
  PROVIDE FIELDS stell FROM p0001
    BETWEEN pn-begda AND pn-endda
    INTO wa.
    WRITE: / pernr-pernr, wa-stell.
  ENDPROVIDE.
```

**Sollantwort:** Der eigentliche Prozess (Mitarbeiter-Selektion, Infotyp-Lesezugriffe, Schleifenstruktur) wird von der LDB PNPCE definiert, die nicht im Quelltext steht. `INFOTYPES` erzeugt implizite Lesezugriffe auf HR-Tabellen — also C-relevante Zugriffe ohne sichtbares SELECT. Skelett: `GET pernr` ist ein datengetriebener Iterationsknoten unbekannter Menge.

**Warum der Korpus scheitert:** K11 (fehlende Quelle) deckt fehlende Includes, nicht eine fehlende *Programmstruktur-Definition*. Der Korpus behauptet nicht, HR abzudecken — aber er behauptet auch nicht, dass seine Skelett-Methodik an LDBs scheitert. Für jeden Kunden mit Payroll-Altbestand ist das der Normalfall, nicht die Ausnahme. `INFOTYPES` ist zusätzlich die schärfste Form von A-071: Abhängigkeiten ohne ausführendes Statement.

## Fall 8 (A-092): Derselbe Code, andere Sprachversion — der Korpus misst nur eine Welt

```abap
" Objekt: ZCL_CLOUD_DEMO, ABAP-Sprachversion: ABAP for Cloud Development
CLASS zcl_cloud_demo DEFINITION PUBLIC FINAL.
  PUBLIC SECTION.
    CLASS-METHODS conv IMPORTING iv_id TYPE clike
                       RETURNING VALUE(rv) TYPE clike.
ENDCLASS.
CLASS zcl_cloud_demo IMPLEMENTATION.
  METHOD conv.
    CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
      EXPORTING input  = iv_id
      IMPORTING output = rv.
  ENDMETHOD.
ENDCLASS.
```

**Sollantwort:** In einer Cloud-Sprachversions-Datei ist `CALL FUNCTION` auf einen nicht freigegebenen klassischen Baustein nicht kompilierbar bzw. per ATC ein harter Verstoß — das korrekte Urteil ist „nicht cloud-fähig, Migrationsbedarf“, nicht „B wie CC-005“.

**Warum der Korpus scheitert:** Der Korpus sagt korrekt, dass `cloud_view` und `classic_extension.level` getrennt sind — aber er hat keinen einzigen Fall, in dem die *Quelle selbst* in einer anderen Sprachversion vorliegt. Alle 25 Fälle sind Standard-ABAP. Damit ist die wichtigste reale Modernisierungsfalle (Kunde portiert, Werkzeug muss den Portierungsstand bewerten) ungetestet. CC-005 als Sollantwort „B“ würde hier vom Tool auf eine Cloud-Datei übertragen und einen Kunden in die falsche Richtung schicken.

## Fall 9 (A-055): `MESSAGE ... RAISING` — zwei Ausgänge je Caller

```abap
" Fragment aus ZCL_SERVICE
METHOD get_customer.
  SELECT SINGLE name1 FROM kna1
    INTO rv_name WHERE kunnr = iv_kunnr.
  IF sy-subrc <> 0.
    MESSAGE ID 'ZFOO' TYPE 'E' NUMBER '001'
      WITH iv_kunnr RAISING not_found.
  ENDIF.
ENDMETHOD.
```

**Sollantwort:** C-Finding auf KNA1. Skelett des Fragments: Der `MESSAGE RAISING`-Zweig hat zwei mögliche Fortsetzungen — Exception an den Caller (wenn `not_found` in dessen Schnittstelle steht) oder Programmabbruch mit Meldung. Welche eintritt, entscheidet der Caller, nicht dieses Fragment.

**Warum der Korpus scheitert:** Der Skelett-Vertrag verlangt „Guard-/Negativpfade fachlich bestätigt“ — aber jedes der 25 Skelette ist innerhalb eines Falls geschlossen. Der Korpus hat kein Fragment-Konzept mit caller-abhängiger Semantik. Die Härtungsstudie hat TRY/CATCH gezählt, aber `MESSAGE RAISING` (das in Altbeständen deutlich häufiger ist als klassische Exceptions) fehlt in beiden Runden komplett.

## Fall 10 (A-043): `MODIFY ztab` — Regelkonflikt zwischen R20 und CC-024-B02

```abap
REPORT zlog_write.
START-OF-SELECTION.
  DATA ls_log TYPE zcc_decision.
  ls_log-case_id = '0001'.
  ls_log-route   = 'AUTO'.
  MODIFY zcc_decision FROM ls_log.
  IF sy-subrc = 0.
    COMMIT WORK AND WAIT.
    WRITE / 'RECORDED'.
  ENDIF.
```

**Sollantwort:** B (eigene Tabelle, R20). Fachsatz: `MODIFY` fügt die Zeile ein, wenn sie fehlt, und aktualisiert sie sonst. `RECORDED` bestätigt nur den Speicherpfad.

**Warum der Korpus scheitert:** CC-024-B02 sagt ausdrücklich „der Code legt keine neue Zeile an“ (denn dort steht `UPDATE`). R20 spricht nur von „eigene Tabelle, kein CAP-Zwang“. Eine Engine, die aus CC-024 generalisiert „UPDATE-artiges Statement auf Z-Tabelle legt nichts an“, trifft für `MODIFY` eine falsche Fachaussage — und der Korpus-Comparator würde sie akzeptieren, weil der Anker stimmt und `claim_semantics = NOT_EVALUATED` bleibt. Das ist der konkrete Beweis, dass die `NOT_EVALUATED`-Lücke nicht akademisch ist: Sie lässt fachlich falsche, mechanisch gültige Ergebnisse zu, die ein Kunde als Wahrheit liest.

# 4. Systematische Lücken

1. **Asynchronität und Nebenläufigkeit (A-018, A-019, A-023, A-024, A-104; 5 Fälle, weitere berührt).** Skelett-Vertrag, R19 und die Fachsatz-Klasse sind rein sequenziell. Der Korpus braucht: asynchrone Knotentypen (Update Task, aRFC-Callback, Hintergrundjob), ein Zeit-/Garantie-Konzept für COMMIT, und verbotene Schlussfolgerungen der Form „Ausgabe nach COMMIT = Persistenz“. Ohne das ist jede Aussage über reale Verbuchungs- und Joblandschaften unzuverlässig.

2. **Datenabhängiger Kontrollfluss (A-027, A-028, A-066, A-068, A-081, A-082; 6 Fälle).** AT NEW/END OF, ON CHANGE OF, PROVIDE, BAdI-Filter, Multi-Use-Dispatch: Der Korpus kennt nur quelltext-ableitbare Kantenbedingungen. Er braucht eine Aussageklasse „Kante nur bei Gruppenwechsel, abhängig von Datenzustand“ und einen Skelett-Knotentyp „Iteration über unbekannte Teilmenge in unbekannter Reihenfolge“.

3. **Dynamisches SQL (A-040, A-041, A-042; 3 Fälle, kritisch).** R01/R02 binden an konkrete Tabellennamen; R07 deckt nur Aufrufziele. Der Korpus braucht Regeln für dynamisches FROM, dynamische WHERE, dynamische DML-Ziele — jeweils mit Zielmengen-Unbekannt statt C/D-Raten. Die Härtungsstudie hat RC-036 (dynamische Projektion) gesehen, die schärfere Variante aber nicht gefordert.

4. **Makros und Quelltext-Expansion (A-035, A-036; 2 Fälle).** Der Zeilenanker-Vertrag (Abschnitt 6) ist für Makros falsch spezifiziert. Der Korpus braucht: Anker-Paare (Definition + Aufrufstelle), Wirkungsort = Aufruf, und eine Negativkontrolle, dass Findings nicht an der Definitionszeile hängen bleiben.

5. **Implizit erzeugte Abhängigkeiten und Struktur (A-069, A-070, A-071, A-072, A-096; 5 Fälle).** INFOTYPES, NODES, TABLES, LDBs, SAP-Includes: Abhängigkeiten und sogar Kontrollfluss entstehen ohne ausführendes Statement. Der Korpus-Satz „Kommentare und Literale erzeugen keine Phantom-Objekte“ braucht das Gegenstück „Deklarationen und LDB-Bindungen erzeugen reale Abhängigkeiten und Zugriffe“. K11 muss um „fehlende Programmstruktur-Definition“ erweitert werden.

6. **Zielkontext-Parameterisierung fehlt als Testdimension (A-004, A-005, A-092; 3 Fälle, kritisch).** Der Korpus fixiert den Kontext je Fall, hat aber kein Fallpaar, das zeigt, dass dieselbe Zeile je Edition/Sprachversion/Release unterschiedlich zu bewerten ist. Ohne mindestens ein solches Paar kann eine Engine Kontextblindheit haben und alle 25 Fälle bestehen.

7. **Fachsatz-Lücke LUW/Commit (A-017, A-044, A-043; 3 Fälle).** Keiner der 64 Fachsätze macht eine Aussage über Persistenzzeitpunkt. R18 („berechnet ≠ genehmigt“) muss um „angekündigt ≠ persistiert“ ergänzt werden.

8. **OO-Dynamik (A-089, A-090, A-088; 3 Fälle).** R14 (Vererbung) und R07 (Dynamik) überlappen nicht sauber; dynamischer Methoden-Dispatch auf Interface-Referenzen hat keine Regel. Korpus braucht eine R07-Erweiterung auf `CALL METHOD ... ('...')` und `describe_by_name`.

9. **Ereignisreihenfolge klassischer Reports (A-075, A-076, A-077, A-060, A-061; 5 Fälle).** INITIALIZATION/AT SELECTION-SCREEN/START-OF-SELECTION/END-OF-SELECTION/STOP: Skelette starten bei START-OF-SELECTION und verlieren die Hälfte klassischer Reports. CHECK in Event-Blöcken ist ein dritter CHECK-Kontext neben RV-027/028.

10. **Native SQL und AMDP (A-007, A-008, A-009; 3 Fälle).** Weder eine Konstruktklasse noch eine Regel deckt EXEC SQL oder AMDP. Native SQL auf DDIC-Tabellen ist der schlimmste reale Clean-Core-Verstoß, den der Korpus gar nicht sehen kann.

# 5. Was ich am Korpus nicht widerlegen konnte

- **Die Trennung von classic level und cloud_view** (Abschnitt 3) habe ich angegriffen (A-092) und nicht widerlegt — sie ist richtig gedacht; es fehlt nur der Testfall, der sie prüft.
- **Die Nachfolger-Typisierung** (TADIR vs. objectType, Abschnitt 5) ist in sich konsistent; ich habe keinen Fall konstruiert, in dem die vier Felder nicht ausreichen. A-051 (VBFA) zeigt nur, dass der *Datenbestand* lückenhaft ist, nicht das Modell.
- **Die Unknown-Disziplin** (CC-015, CC-012) habe ich versucht, mit A-093/A-094 zu unterlaufen („pauschales Unknown ist zu grob“) — das ist eine Präzisierungsforderung, keine Widerlegung: Unknown ist besser als jede erfundene Antwort.
- **Die Comparator-Härtung der Vorstudie** kann ich nicht ausführen und daher nicht bestreiten; ich akzeptiere die 15 False-Accept-Befunde als reproduziert.

**Wo die Härtungsstudie sich meiner Meinung nach irrt:** Erstens überschätzt sie den Wert ihrer 355 Merkmalsprüfungen — sie prüfen lexikalische Vorkommen, nicht die Sollantworten des Korpus; „561/561 bestanden“ sagt über die Eignung als Ground Truth fast nichts. Zweitens hat sie die Lückenliste zu kurz gefasst: TRY/CHECK/Schleifen/Memory sind Symptome; die eigentlichen Lücken sind Asynchronität, datenabhängiger Kontrollfluss, dynamisches SQL und Zielkontext (meine Lücken 1–6), die in ihrer Tabelle in Abschnitt 6 nicht auftauchen. Drittens ist ihre Stichprobe (zwei Projekte, sechs Dateien) methodisch kaum besser als der synthetische Korpus, den sie kritisiert — die Forderung nach „mehr unabhängigen Projekten“ stellt sie richtig, kommt ihr aber selbst nicht nach.

# 6. Freigabeempfehlung

**Nicht freigeben.** Der Korpus ist als „candidate ground truth“ ehrlich etikettiert, aber er testet die Aussageklassen, für die er als Oracle dienen soll (Level je Zielkontext, Nachfolger, Fachsätze, Skelette) nur in Sequenz- und Einzelkonstrukt-Form; die häufigsten realen Fehlerquellen — Asynchronität, datenabhängiger Fluss, dynamisches SQL, Makros, LDB/HR, Cloud-Sprachversion — sind gar nicht oder nur als Regeltext ohne Fälle vertreten. Eine Engine kann heute alle 25 Fälle bestehen und an jedem meiner zehn Kernfälle scheitern, ohne dass der Comparator es merkt; das disqualifiziert ihn als Freigabe-Grundlage für Kundenentscheidungen. Die Vorstudie hat die Vergleichsmechanik gehärtet, aber die inhaltliche Abdeckung nicht erweitert — Freigabe setzt beides voraus.

**Auflagen für eine Wiedervorlage:**

1. Mindestens ein Fallpaar mit identischem Code in zwei Zielkontexten (Standard-ABAP vs. Cloud-Sprachversion), mit unterschiedlichen Sollantworten.
2. Fälle für: Update Task + COMMIT-Race, aRFC-Callback, AT NEW, Multi-Use-BAdI, dynamisches FROM, dynamisches DML-Ziel, Makro, `MESSAGE RAISING`, `INFOTYPES`/LDB, EXEC SQL, `MODIFY` auf Z-Tabelle (mit korrigiertem Fachsatz zu CC-024-B02).
3. Skelett-Vertrag erweitern um: asynchrone Knoten, datenabhängige Kanten, caller-abhängige Fragment-Semantik, Makro-Wirkungsort.
4. Neue Regeln oder Regelversionen für dynamisches SQL und OO-Dynamik; R02 auf INSERT/MODIFY/DELETE erweitern; R10 explizit auf implizite Enhancements begrenzen (A-084).
5. Stichprobe aus mindestens fünf unabhängigen, fachlich verschiedenen Quellen (z. B. HR, FI-Altbestand, ALV-Reporting, IDoc-Verarbeitung, Cloud-Portierungsprojekt), nicht zwei Utility-Bibliotheken.
6. Die `claim_semantics = NOT_EVALUATED`-Lücke dokumentiert als bekanntes Risiko in jedem kundensichtbaren Ergebnis, nicht nur im Methodenteil.