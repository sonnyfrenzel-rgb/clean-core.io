**1. Urteil (max. 15 Zeilen).**

Der Korpus hält **nicht** als Ground Truth für reale Programme. Er ist ein ehrlicher Mikrovertrags-Kandidat für 25 synthetische Scheiben; sobald Code LUW, Update-Task, Makros, dynamisches SQL, transitives Schreiben, RAP/EML-Flags, SAP-Exits oder GUI-/Job-Orchestrierung enthält, ist die „richtige Antwort“ im v1-Vertrag entweder **leer** oder **falsch**.

Schwerwiegendster Einzelmangel: **Klassifikation ohne interprozeduralen Wirkungskontext.** Ein Z-Wrapper, ein Makro oder eine RAP-Fassade kann syntaktisch wie Level B/A aussehen, während die Wirkung ein ununterstütztes SAP-Tabellenschreiben, ein leeres FAE (= volle Tabelle), `CLIENT SPECIFIED`, `IN LOCAL MODE` oder ein Kernel-/OS-Aufruf ist. Ein Kunde, der den Korpus als Oracle nimmt, würde Modernisierung, Risiko und Nachfolger **systematisch falsch entscheiden**.

Die 103 abapGit/abap2xlsx-Methoden der Vorstudie treffen das nicht: zu homogen, kein ERP-Fachcode, keine Dynpro-/BDC-/BAPI-LUW, kein RAP. Ich habe den Korpus nicht „grün“ gefunden; wo ich ihn nicht widerlegen konnte, steht das in Abschnitt 5.

**2. Die Fälle.**

Herkunft ohne URL/Zeile, außer wo ein SAP-Objektname selbst der Beleg ist. Keine erfundenen Repos.

| ID | ABAP-Konstrukt | Herkunft | Beleggrad | Angriffspunkt | Was der Korpus sagen würde | Was richtig wäre | Schwere |
|---|---|---|---|---|---|---|---|
| H-001 | `UPDATE mara` hinter Z-Klasse | ECC/S4-Materialpflege, nachgebaut | konstruiert | Modernisierungsfalle: sieht nach K02/B aus | Wrapper = B, kein D-Finding | Wirkung D; Fassade ändert Level nicht | kritisch |
| H-002 | `MODIFY mara FROM TABLE` | Massenpflege, nachgebaut | konstruiert | R02 kennt vor allem `UPDATE` | evtl. internes MODIFY / kein D | DB-DML auf SAP-Kern = D | kritisch |
| H-003 | `INSERT mara FROM TABLE` | Eigenes Anlegeprogramm | konstruiert | INSERT vs UPDATE | unklar / kein Finding | ununterstütztes Schreiben = D | kritisch |
| H-004 | `DELETE FROM kna1 WHERE` | Bereinigungsreport | konstruiert | DELETE-Keyword vs interne Tabelle (Vorstudie RC-014) | Gefahr: internes DELETE oder C | DB-Delete SAP-Stamm = D | kritisch |
| H-005 | Z-API ruft Z-API ruft `UPDATE kna1` | Schichtenarchitektur | konstruiert | transitiv, interprozedural | oberste Klasse B | known-worst D; Urteil unvollständig sonst Unknown | kritisch |
| H-006 | Makro `DEFINE upd. UPDATE mara. END-OF-DEFINITION.` | Altes MM-Include | konstruiert | R13/Lexer sieht kein Statement | kein Finding / Kommentarähnlich | expandiertes DML = D; Anker auf Expand | kritisch |
| H-007 | `SELECT … FOR ALL ENTRIES` ohne Guard | FI/MM-Listen | konstruiert | R09 nur positiver Guard (CC-002) | kein „ungesichertes FAE“ | leere itab = keine WHERE-Einschränkung | kritisch |
| H-008 | FAE nach `APPEND` nur im IF, sonst leer | Report mit optionalem Filter | konstruiert | Datenfluss vs syntaktischer Guard | Guard „vorhanden“ falsch positiv | Pfad ohne APPEND bleibt ungesichert | kritisch |
| H-009 | FAE mit Duplikaten in Treibertabelle | IDoc-Verdichtung | konstruiert | R08/R09 Kardinalität | Lesen C, Semantik egal | Ergebnismenge ≠ fachliche Menge | hoch |
| H-010 | `WHERE (lv_where)` | dynamische SE16-Klone | konstruiert | R01 statische Tabelle, R07 nur FM | KNA1-C, WHERE ignoriert | Zielmenge unbekannt; Injection; Unknown+Security | kritisch |
| H-011 | `FROM (lv_tab)` dynamisch | generisches Protokoll | konstruiert | dynamisches FROM | fehlendes Objekt / K11 | jede statische Tabellenklasse ist Annahme | kritisch |
| H-012 | `EXEC SQL` / `ENDEXEC` | HANA-Hint-Altlast | konstruiert | K08 nur `CALL '…'` | kein Kernel, evtl. B | Native SQL, kein Clean-Core-A; mind. Unknown/D-Kandidat | kritisch |
| H-013 | ADBC `cl_sql_statement=>execute_query` | Sidecar-DB | konstruiert | K02 Wrapper um SQL | B weil eigene Klasse | Native SQL + Connection; nicht R01-SELECT | hoch |
| H-014 | `CONNECTION (lv_con)` | RFC-artige DB-Nebenverbindung | konstruiert | Prozess/LUW | normales SELECT C | andere DB, andere LUW, opaker Commit | hoch |
| H-015 | AMDP `BY DATABASE PROCEDURE` | S/4-HANA-Custom | konstruiert | nicht in K01–K11 | ABAP-Methode B | SQLScript außerhalb ABAP-Skeletts | hoch |
| H-016 | `CLIENT SPECIFIED` auf `t000`/`kna1` | Mandantenreport | konstruiert | R01 ohne Mandantensemantik | C-Lesen | Mandantentrennung gebrochen; Security+D-nah | kritisch |
| H-017 | `USING CLIENT lv_mandt` | Zentralreport | konstruiert | OpenSQL-Variante | wie SELECT C | Cross-Client; Freigabe/ATC separat | kritisch |
| H-018 | `BYPASSING BUFFER` | „Performance“-Trick | konstruiert | kein Regelvertrag | C | Semantik/Puffervertrag verletzt; nicht drop-in CDS | mittel |
| H-019 | `SELECT FOR UPDATE` | Bestandsreservierung | konstruiert | R01 nur Lesen | C | Sperrlesen, LUW, Deadlock; kein reines C | hoch |
| H-020 | `OPEN CURSOR WITH HOLD` + `COMMIT` | Massenjob | konstruiert | R19 linear | Loop-Lesen | Cursor/LUW-Interaktion; COMMIT tötet Cursor ohne HOLD | hoch |
| H-021 | `SELECT … PACKAGE SIZE` + `COMMIT WORK` in Schleife | Migration | konstruiert | R19 | paketiertes Lesen | SAP-LUW zerlegt; Folgeschritte sehen Teilmengen | kritisch |
| H-022 | `SELECT`/`ENDSELECT` + `EXIT` | Alt-Report | konstruiert | kein ENDSELECT im Korpus | LOOP-ähnlich | Cursor-Semantik, sy-dbcnt, EXIT-Scope | mittel |
| H-023 | `CALL FUNCTION … IN UPDATE TASK` | Belegbuchung | konstruiert | R06 statischer FM = B (CC-005) | B/info wie ALPHA | asynchron V1/V2; Fehler in SM13; Skelett falsch wenn sync | kritisch |
| H-024 | `IN BACKGROUND TASK DESTINATION` | tRFC-Versand | konstruiert | R06 | statischer FM | tRFC-LUW, Wiederholung, Destination | hoch |
| H-025 | `STARTING NEW TASK` + `WAIT UNTIL` | Parallelisierung | konstruiert | R07 | dynamischer RFC | aRFC, Teilfehler, Timeout; Graph nicht linear | hoch |
| H-026 | `PERFORM … ON COMMIT` | Belegnacharbeit | konstruiert | R19 | FORM-Aufruf | läuft erst beim COMMIT; bei ROLLBACK nicht | kritisch |
| H-027 | `PERFORM … ON ROLLBACK` | Ausgleichsbuchung | konstruiert | R19 | unmodelliert | nur Rollback-Pfad | hoch |
| H-028 | `SET UPDATE TASK LOCAL` | Dialogbuchung | konstruiert | kein Konstrukt | ignoriert | ändert Update-Lokalität der ganzen LUW | hoch |
| H-029 | `BAPI_*` + `BAPI_TRANSACTION_COMMIT` | Einkauf/Vertrieb | konstruiert | K03 FM B | zwei statische FMs B | BAPI-Vertrag ≠ DROP-IN; Commit-Semantik, TESTRUN | hoch |
| H-030 | BAPI ohne Commit, Caller committet | Split API | konstruiert | R18/R19 | BAPI „bucht“ | ohne Caller-Commit keine Buchung | hoch |
| H-031 | `CALL TRANSACTION … USING bdc_tab` | Batch-Input-Nachfolger | konstruiert | R11 Dynpro B | Dynpro/B analog CC-013 | fremde Transaktion, Modi A/N/E, eigene LUW | kritisch |
| H-032 | `LEAVE TO TRANSACTION` + `SET PARAMETER ID` | Cockpit | konstruiert | R11/R18 | Navigation | SPA/GPA, Skip-first-screen; Prozess verlässt Programm | hoch |
| H-033 | `SUBMIT (lv_repid) AND RETURN` | Framework | konstruiert | K06/K11 | unaufgelöst wie CC-012 | dynamisches Programm, Selektion, Liste | hoch |
| H-034 | `SUBMIT … EXPORTING LIST TO MEMORY` | Wrapping-Report | konstruiert | R18 | SUBMIT | Listspeicher ≠ Fachdatenbank; IMPORT nötig | mittel |
| H-035 | `JOB_OPEN`/`JOB_SUBMIT`/`JOB_CLOSE` | Periodenjob | konstruiert | R19 | drei FMs | asynchroner Prozess, Startbedingung nicht im Code | hoch |
| H-036 | `GENERATE SUBROUTINE POOL` | dynamischer Parser | konstruiert | K08/K06 | Kernel/Unknown | Laufzeitcode, Injection, keine statische GT | kritisch |
| H-037 | `INSERT REPORT` / `READ REPORT` | Code-Generator | konstruiert | R13 Quelle-als-Daten | Text | Repository-Schreiben von ABAP; Security/D | hoch |
| H-038 | `SYNTAX-CHECK FOR lt_code` | Generator | konstruiert | R18 | Prüfung | prüft nicht Clean-Core; nur Syntax | niedrig |
| H-039 | `CALL METHOD lo->(lv_meth)` | Plugin-Tabelle | konstruiert | R07/R14 | dynamisch, ggf. auflösbar | ohne Closed World Unknown; nicht Super-Dispatch | hoch |
| H-040 | `CREATE OBJECT lo TYPE (lv_cls)` | Strategy-Factory | konstruiert | R14 CC-017 lokal | Factory B | Laufzeittyp extern = CC-018-Klasse, nicht lokal | hoch |
| H-041 | `ASSIGN (lv_name) TO <fs>` | dynamisches Feld | konstruiert | R15 CC-020 nah | ähnlich CC-020 | plus Schreibalias auf SAP-Struktur möglich | hoch |
| H-042 | `ASSIGN COMPONENT … CASTING` | Unicode-Alt | konstruiert | R15 | RTTI B | Cast-Semantik, Alignment, Dump-Pfad | mittel |
| H-043 | `CREATE DATA … TYPE HANDLE` | generisches Mapping | konstruiert | R15 | RTTI released B/usable | erzeugter Typ nicht lokal bekannt | mittel |
| H-044 | `cl_abap_structdescr=>create` | dynamisches DDIC | konstruiert | R15 CC-019 | released RTTI = B/usable | Laufzeit-DDIC ≠ released API-Nutzung allein | mittel |
| H-045 | EML `READ ENTITIES … IN LOCAL MODE` | RAP-Handler | konstruiert | fehlt komplett | „modern“ = A | umgeht DCL; Security, nicht automatisch A | kritisch |
| H-046 | `WITH PRIVILEGED ACCESS` | RAP-Determination | konstruiert | fehlt | A weil RAP | privilegierter Bypass; muss Finding sein | kritisch |
| H-047 | `MODIFY ENTITIES` unmanaged Save → `UPDATE vbak` | RAP-Fassade | konstruiert | K02 vs R02 | RAP A / Wrapper B | Save-Implementierung D | kritisch |
| H-048 | `COMMIT ENTITIES` vs `COMMIT WORK` | Mischcode | konstruiert | R19 CC-023 | COMMIT wie CC-023 | RAP-LUW ≠ SAP-LUW; Mischung korrupt | hoch |
| H-049 | CDS-Pfad `\_customer-name` | RAP-Query | konstruiert | K04 Join | 3-Tabellen-C | Assoziationskardinalität/NULL ≠ INNER JOIN | hoch |
| H-050 | CDS-Nachfolger lesend, `UPDATE` weiter auf Tabelle | S/4-Hybrid | konstruiert | R02 CC-023 gut | D trotz CDS — hier korrekt | korrekt D; Korpus hat kein Hybrid-Lesen+Schreiben in einem Artefakt | mittel |
| H-051 | Replacement Object / Proxy-View `mseg` | S/4-Kompatibilität | konstruiert | R01 KNA1-Logik | C + CDS-Nachfolger | physische Tabelle ≠ Proxy; Semantik/ATC releaseabhängig | hoch |
| H-052 | `acdoca` statt `bseg` | S/4-Finance | konstruiert | R01 | C analog KNA1 | Universal Journal; Nachfolger/Join-Semantik strittig | hoch |
| H-053 | `but000` + `kna1` parallel (CVI) | BP-Migration | konstruiert | R01/R08 | zwei C-Funde | Doppelpflege, CVI-Richtung; nicht 2× I_CUSTOMER | kritisch |
| H-054 | `GET BADI` mit `FILTERS` | VKORG-BAdI | konstruiert | R24 CC-009 single-use | eine Impl. wie Fixture | Filtermenge, 0..n Impl., Reihenfolge | hoch |
| H-055 | `cl_exithandler=>get_instance` | klassisches BAdI | konstruiert | R24/R10 | GET BADI oder Unknown | Classic-BAdI, Multiple-Use, Customizing | hoch |
| H-056 | `CALL CUSTOMER-FUNCTION '001'` | EXIT_SAPL… | erinnert | K05 nur BAdI/ENHO | fehlendes FM / B | User-Exit, oft D-nah (SAP-Modifikationsmodell) | hoch |
| H-057 | `ENHANCEMENT-POINT` / `SECTION` | expliziter Spot | konstruiert | R10 nur implicit=D | Gefahr D wie CC-010 | explizit ≠ implicit; Level kontextabhängig | hoch |
| H-058 | implizites Enhancement in SAP-Include `MV45AFZZ` | Vertriebs-Exit | erinnert | CC-010 Z-Report+Fixture | ohne Hostmetadata kein D (R10) | realer Host ist SAP; D unabhängig vom Z-Namen | kritisch |
| H-059 | `OPEN_FI_PERFORM_*` BTE | FI-Schnittstelle | erinnert | K05 | dynamischer FM | Customizing-gesteuerte Multi-Impl.; nicht im Quelltext | hoch |
| H-060 | BRF+ `cl_fdt_function=>process` | Entscheidungsdienst | konstruiert | R18 | Methodenaufruf B | Regeln nicht im ABAP; Skelett unvollständig | hoch |
| H-061 | Switch Framework `cl_abap_switch` / SFW | Industry-Switch | konstruiert | R19 | IF | toter/ lebender Code releaseabhängig | mittel |
| H-062 | `ME_PROCESS_PO_CUST` `process_item` | MM-BAdI | erinnert | R24 | kundeneigen B | SAP-BAdI on-stack; Classic vs Cloud-Nachfolger strittig | hoch |
| H-063 | `USEREXIT_SAVE_DOCUMENT` | MV45AFZZ | erinnert | K02/K05 | B oder D je Fixture | Standard-Exit; Prozess = SAP-Beleg speichern, nicht Z-Report | kritisch |
| H-064 | Feldsubstitution GGB1-Exit | FI-Validation | erinnert | R18 | Zuweisung B | Customizing-gebunden; statisch nicht rekonstruierbar | hoch |
| H-065 | NAST/TNAPR → dynamischer FM | Nachrichtenfindung | erinnert | R06/R07 | dynamischer FM | Prozess in Customizing, nicht im Report | hoch |
| H-066 | `SWE_EVENT_CREATE` | Workflow | konstruiert | R18 | FM B | asynchroner Org-/Regelgraph | hoch |
| H-067 | `AUTHORITY-CHECK OBJECT` fehlt vor `SELECT kna1` | Listenreport | konstruiert | R01 | C-Lesen | ohne AuthC kein fachliches C-„ok“; DCL/S_TABU separat | kritisch |
| H-068 | `AUTHORITY-CHECK` sy-subrc ignoriert | Copy-Paste | konstruiert | R18/R19 | Check vorhanden | wirkungslos; Skelett darf Erfolg nicht annehmen | kritisch |
| H-069 | `IF sy-uname = 'BATCH'` statt Auth | Backdoor | konstruiert | R18 | B Standard-ABAP | Security-Finding; kein Clean-Core-A | kritisch |
| H-070 | `SELECT * FROM usr02` | Admin-Tool | konstruiert | R01 analog KNA1 | C | Authentifizierungsdaten; nicht Stammdaten-C | kritisch |
| H-071 | `S_TABU_NAM` umgangen via View | SE16-Klon | konstruiert | R01 | View-Lesen | Berechtigungsfalle | hoch |
| H-072 | `SXPG_COMMAND_EXECUTE` | OS-Kommando | konstruiert | K03 B | statischer FM B | OS-Exec, S_LOG_COM; weit jenseits B | kritisch |
| H-073 | `CALL 'SYSTEM' ID 'COMMAND'` | Kernel | konstruiert | R12 CC-015 Unknown | Unknown (gut) oder D erfunden | Unknown halten; nie A; Security separat | kritisch |
| H-074 | `CALL 'ThUsrInfo'` | Kernel-User | konstruiert | R12 nur C_SAPGPARAM | unbekanntes CALL | andere Kernel-ID; nicht CC-015 kopieren | hoch |
| H-075 | `OPEN DATASET lv_path` aus Parameter | File-Interface | konstruiert | K02 B | B | Directory Traversal, S_DATASET; Cloud ungeeignet | hoch |
| H-076 | `cl_gui_frontend_services=>execute` | GUI-Start | konstruiert | R11/K02 | GUI B | Client-OS; nicht Serverprozess | hoch |
| H-077 | `GUI_UPLOAD` / `WS_UPLOAD` | Alt-Upload | konstruiert | R11 | B | obsolete API, Presentation Server, kein Cloud | mittel |
| H-078 | `ENQUEUE`/`DEQUEUE` | Sperrobjekt | konstruiert | R18 | unmodelliert | Sperrgraph Teil des Prozesses; kein DB-Write | mittel |
| H-079 | `NUMBER_GET_NEXT` | Belegnummer | konstruiert | K03 B | B | SNRO-Intervall, Puffer, LUW; fachlicher Schlüssel | mittel |
| H-080 | `CONVERT_TO_LOCAL_CURRENCY` | FI-Betrag | konstruiert | R23 CC-025 | Währungstext | echte Kursumrechnung ≠ WRITE CURRENCY (Vorstudie) | hoch |
| H-081 | `WRITE … CURRENCY` in Belegliste | ALV-Vorbereitung | konstruiert | R23 | Gefahr: Umrechnung | nur Formatierung | mittel |
| H-082 | `UNIT_CONVERSION_SIMPLE` | MM-Menge | konstruiert | R23 | Zahl | Dimension/Einheit, Fehler sy-subrc | mittel |
| H-083 | `SSF_FUNCTION_MODULE_NAME` + `CALL FUNCTION lv_fm` | Smartforms | konstruiert | R06 vs R07 | Variable dynamisch, Datenfluss Singleton | generiertes FM-Ziel releaseabhängig | mittel |
| H-084 | `cl_bcs` Send + später `COMMIT WORK` | Mailversand | konstruiert | R19 | Send = gesendet | ohne Commit oft kein Versand | hoch |
| H-085 | `MASTER_IDOC_DISTRIBUTE` | ALE | konstruiert | K03 | FM B | IDoc-LUW, Empfängermodell nicht im Code | hoch |
| H-086 | `CALL TRANSFORMATION` | XML-API | konstruiert | R13 | Transformation | XSLT/ST-Abhängigkeit fehlt = K11 | mittel |
| H-087 | `/ui2/cl_json=>serialize` | REST-Wrapper | konstruiert | K02/R04 | Wrapper B | API-Freigabe strittig; nicht HTTP-Utility-Overlap | mittel |
| H-088 | `cl_http_client=>create_by_url` | Outbound | konstruiert | CC-004 nur Utility | analog B | Netzwerk, SM59/SSL, Cloud-Destination nötig | hoch |
| H-089 | RFC `DESTINATION lv_dest` | Integration | konstruiert | R07 | dynamisch | Trust, Callback, keine Classic-B-Garantie | hoch |
| H-090 | `DESTINATION 'NONE'` | lokale RFC | konstruiert | R06 | statisch B | neue LUW/Session; Seiteneffekt | hoch |
| H-091 | `EXPORT … TO DATABASE indx(xy)` | Cluster | konstruiert | Memory nur in Vorstudie | kein Finding | persistenter Cluster ≠ ABAP-Memory | hoch |
| H-092 | `IMPORT FROM DATABASE pcl2(rx)` | HR-Payroll | erinnert | K01 | Cluster-Lesen C? | HR-Cluster, hochsensibel, nicht KNA1-C | kritisch |
| H-093 | `EXPORT TO SHARED BUFFER` | Puffer | konstruiert | R19 | Memory analog | instanzlokal, Invalidierung | mittel |
| H-094 | Shared Objects `attach_for_write` | SHMA | konstruiert | K09 | OO B | Cross-Session-Mutation | hoch |
| H-095 | `GET PARAMETER ID` / `SET PARAMETER ID` | SPA/GPA | konstruiert | R18 | unmodelliert | Session-UI-Zustand, nicht ABAP-Memory | mittel |
| H-096 | `LOOP AT SCREEN` / `MODIFY SCREEN` | Dynpro | konstruiert | R11 CC-013 | B Dynpro | Feldsteuerung; Cloud-UI nicht drop-in | mittel |
| H-097 | `SET SCREEN lv_dynnr` / `LEAVE TO SCREEN lv` | dynamische Folge | konstruiert | CC-014 fehlender Screen | opak | Zielscreen datenabhängig; Skelett nicht fix | hoch |
| H-098 | `CHAIN` / `FIELD` / `MODULE ON REQUEST` | PAI | konstruiert | CC-013 CASE ok_code | analog CHECK | Request-Semantik, Feldkette | mittel |
| H-099 | Table Control `LOOP AT itab WITH CONTROL` | Dialog | konstruiert | R11 | LOOP | Steploop/PBO-PAI verschränkt | mittel |
| H-100 | `TRY/CATCH cx_root` + `RETRY` + `CLEANUP` | Integrationsadapter | konstruiert | Vorstudie Lücke, nicht im Korpus | linearer Happy Path | cx_root verschluckt; RETRY-Loop; CLEANUP ≠ finally | kritisch |
| H-101 | `CATCH BEFORE UNWIND` + `RESUME` | resumable | konstruiert | R19 | CATCH = Fehlerende | Resumption; Graph braucht Resume-Kante | hoch |
| H-102 | `ASSERT ID zcc CONDITION` | prüfbares ASSERT | konstruiert | Vorstudie ASSERT ohne ID | Abbruch wie CC-002-Guard | checkpoint-Gruppe; produktiv oft inaktiv | hoch |
| H-103 | `CHECK` in `LOOP` vs Methoden-`CHECK` | Listenfilter | konstruiert | Korpus 0 CHECK | RETURN analog CC-001 | LOOP-CHECK ≠ Prozedur-CHECK (Vorstudie richtig) | hoch |
| H-104 | `AT NEW` mit Header-Line | Alt-Extract | konstruiert | R23 | IF-Grenze | * -Felder, Sortabhängigkeit | mittel |
| H-105 | `READ TABLE … BINARY SEARCH` ohne `SORT` | Performance-Alt | konstruiert | R18 | READ | undefiniertes Trefferverhalten | hoch |
| H-106 | Tabellenausdruck `itab[ kunnr = … ]` ohne OPTIONAL | 7.40-Code | konstruiert | R19 | READ | Dump statt sy-subrc; Skelett braucht Exception | hoch |
| H-107 | `FOR`/`REDUCE`/`FILTER` mit Nebenwirkung in Methode | 7.54-Mapping | konstruiert | R13 Template | Ausdruck | funktionale Ausdrücke können schreiben | mittel |
| H-108 | `TEST-SEAM` / `TEST-INJECTION` | produktiver Report | konstruiert | R18 | tot | injizierbares Verhalten; GT nur mit Seam-Kontext | mittel |
| H-109 | LDB `GET pernr` + `PROVIDE` | HCM-Report | erinnert | K01/K07 | SELECT analog | LDB-Ereignisse, Infotypen, Makros | hoch |
| H-110 | `RP-PROVIDE-FROM-LAST` Makro | HCM | erinnert | R13/Makro | unsichtbar | expandiert Infotyp-Zugriff | hoch |
| H-111 | OData `GET_ENTITYSET` + dynamisches `$filter` | SEGW DPC_EXT | konstruiert | H-010 verwandt | SELECT C | Filterstring Laufzeit; SADL vs handisch | hoch |
| H-112 | `CL_SALV_TABLE=>factory` | ALV | konstruiert | R11 | B GUI | nicht Dynpro, aber Presentation; Cloud-UI separat | niedrig |
| H-113 | `CL_GUI_ALV_GRID` `data_changed` | editierbares ALV | konstruiert | R11/R02 | GUI B | kann DB-Write im Handler auslösen | hoch |
| H-114 | `#EC CI_NOWHERE` / `##NO_TEXT` an `SELECT * FROM kna1` | ATC-gegrünter Report | konstruiert | R01 | C | ATC-Grün ≠ Clean-Core-A; Exemption verdeckt C/D | kritisch |
| H-115 | Sprache v5 (ABAP Cloud) vs Standard, gleicher `SELECT mara` | Hybrid-PCE | konstruiert | Profil nur Fixture-C | C | Cloud: unzulässig; Classic: C; Level ist Profil, nicht Zeile | kritisch |
| H-116 | `WITH HEADER LINE` + `MOVE-CORRESPONDING` auf dbtab | Release 4.6-Klon | konstruiert | R02 | MOVE kein Write | Header-Line-MODIFY kann DB treffen | hoch |
| H-117 | `COLLECT` auf Standardtabelle vs HASHED | Verdichtung | konstruiert | R08 | LOOP | Schlüsselkollision/Semantik | niedrig |
| H-118 | `DELETE ADJACENT DUPLICATES` ohne Sort | Dedup | konstruiert | R18 | Filter | nur benachbart; fachlich falsch | mittel |
| H-119 | `ON CHANGE OF` (obsolete) | Alt-Report | konstruiert | R19 | IF | globales Vergleichsfeld, überraschend | mittel |
| H-120 | `CATCH SYSTEM-EXCEPTIONS` (obsolete) | Arithmetik | konstruiert | vs TRY | kein CATCH | andere Semantik als CX | mittel |
| H-121 | `EDITOR-CALL FOR REPORT` | Dev-Tool | konstruiert | R11 | GUI | ändert Quellen; nicht Anzeige | hoch |
| H-122 | `CALL DIALOG` | Alt-Dialog | konstruiert | R11 | Dynpro B | eigene LUW/Using; kaum Cloud | hoch |
| H-123 | `SEARCH HELP EXIT` FM | F4 | konstruiert | K03 | B | UI-Exit, nicht Prozesskern | niedrig |
| H-124 | Viewcluster-Event 01 `BEFORE SAVE` | SM30 | konstruiert | R20 eigene Tabelle | B eigenes UPDATE | kann SAP-Tabellen mitpflegen | hoch |
| H-125 | `RKSE16N_EDIT` / `&SAP_EDIT` | Support | erinnert | R02 | FM B | berüchtigtes Editieren; D + Security | kritisch |
| H-126 | Parallel Cursor (`LOOP` + `READ BINARY SEARCH`) | Massen-FI | konstruiert | K04 | zwei LOOPs | Korrektheit sortabhängig | mittel |
| H-127 | `SELECT DISTINCT` vs später `SORT`/`DELETE ADJACENT` | Performance-Umbau | konstruiert | R08 | gleiche Menge | NULL/Locale; nicht äquivalent | mittel |
| H-128 | Window/`OVER` in Open SQL | 7.54 | konstruiert | K04 | Join C | analytische Semantik fehlt im Skelett | mittel |
| H-129 | `UNION ALL` zweier SAP-Tabellen | Abgleich | konstruiert | R01+R08 | zwei C | Duplikatpolitik | mittel |
| H-130 | dynamisches `PERFORM (lv) IN PROGRAM sy-cprog` | eigenes Plugin | konstruiert | CC-012 extern | unaufgelöst | gleiches Programm, FORMs fehlen im Slice = K11 | mittel |

**3. Die zehn wichtigsten Fälle ausgeschrieben.**

### H-001 — Z-Fassade, die D als B verkauft

```abap
CLASS zcl_mat_api DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS rename IMPORTING iv_matnr TYPE matnr
                             iv_maktx TYPE maktx
                             iv_test  TYPE abap_bool DEFAULT abap_true.
ENDCLASS.
CLASS zcl_mat_api IMPLEMENTATION.
  METHOD rename.
    IF iv_test = abap_true.
      RETURN.
    ENDIF.
    UPDATE mara SET ersda = sy-datum WHERE matnr = iv_matnr.
    UPDATE makt SET maktx = iv_maktx
      WHERE matnr = iv_matnr AND spras = sy-langu.
    IF sy-subrc = 0.
      COMMIT WORK AND WAIT.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
```

**Sollkandidat:** Classic **D** (R02), Cloud `not_usable`. Testmodus überspringt Schreiben (R19). `I_PRODUCT` ist Lese-Nachfolger, kein Write-API. Zeilenanker: beide `UPDATE`, nicht die Klassendeklaration.

**Korpus scheitert:** CC-003/024 bewerten Wrapper/eigene Tabelle als B. K02 „simple wrapper“ ohne Blick in die Wirkung klassifiziert die Fassade als sauberen Bestand. Ein Kunde würde „Z-API = on-stack B“ bauen und das D-Schreiben behalten.

### H-007 — FAE ohne Guard (leere itab = volle Tabelle)

```abap
REPORT z_fae_unguarded.
PARAMETERS p_werks TYPE werks_d.
DATA lt_mat TYPE STANDARD TABLE OF matnr WITH EMPTY KEY.
START-OF-SELECTION.
  IF p_werks IS NOT INITIAL.
    SELECT matnr FROM marc INTO TABLE @lt_mat WHERE werks = @p_werks.
  ENDIF.
  SELECT matnr, maktx FROM makt
    FOR ALL ENTRIES IN @lt_mat
    WHERE matnr = @lt_mat-table_line
      AND spras = @sy-langu
    INTO TABLE @DATA(lt_txt).
```

**Sollkandidat:** Finding analog R09 **verboten in CC-002, hier zwingend**. Leeres `lt_mat` (p_werks initial **oder** kein MARC-Treffer) macht die WHERE-Bedingung wirkungslos — SAP-FAE-Semantik. Zusätzlich R01 auf MARC/MAKT. Prozess: der IF schützt nur das Füllen, nicht die FAE.

**Korpus scheitert:** Nur der positive Guard ist spezifiziert („kein ungesichertes FAE melden“). Ohne Negativfall akzeptiert ein Engine-Vergleich „kein Finding“. Das ist eine **falsche Kundenentscheidung** (Vollscan/Vollzugriff).

### H-023 — Update-Task ist nicht CC-005

```abap
FUNCTION z_book_doc.
  CALL FUNCTION 'Z_BOOK_DOC_UPD'
    IN UPDATE TASK
    EXPORTING is_bkpf = is_bkpf.
  IF iv_commit = abap_true.
    COMMIT WORK AND WAIT.
  ENDIF.
ENDFUNCTION.
```

**Sollkandidat:** Aufruf **asynchron in V1-Update**. Erfolg der Buchung ist nicht die RETURN-Kante der FUNCTION. Fehlerpfad SM13, nicht sy-subrc des Callers (außer AND WAIT + Update-Dump). Level: kundeneigenes FM B, aber Prozessskelett muss `opaque_update_task` + Commit-Gate haben.

**Korpus scheitert:** R06/R19 modellieren FM als synchrone `opaque_call` (CC-005/011). Ein Ist-Skelett „FM → Ende“ behauptet eine Buchung, die ohne COMMIT nie stattfindet und mit COMMIT in anderem Workprozess läuft.

### H-010 — Dynamisches WHERE

```abap
REPORT z_dyn_where.
PARAMETERS p_where TYPE c LENGTH 80.
DATA lt TYPE TABLE OF kna1.
START-OF-SELECTION.
  SELECT * FROM kna1 INTO TABLE lt WHERE (p_where).
```

**Sollkandidat:** R01-C auf KNA1 **unzureichend**. Bindung dynamisch; Zielmenge, Berechtigung und Injection sind **nicht** statisch beweisbar. R07: „unbekanntes Ziel offen lassen und Sicherheitsprüfung verlangen“ — analog auf SQL erweitern. Level: C **und** Security-Unknown, nicht „Kundenliste wie CC-001“.

**Korpus scheitert:** CC-001 verankert `WHERE land1 = @p_land` als Fachsatz. Dieselbe Tabelle mit `(p_where)` darf denselben Fachsatz **nicht** tragen. Zeilenzuordnung „das SELECT“ ist mehrdeutig (Tabelle vs. Bedingung).

### H-006 — Makro versteckt DML

```abap
DEFINE write_kna.
  UPDATE kna1 SET name1 = &1 WHERE kunnr = &2.
END-OF-DEFINITION.
FORM save USING iv_name TYPE name1 iv_kunnr TYPE kunnr.
  write_kna iv_name iv_kunnr.
ENDFORM.
```

**Sollkandidat:** Nach Makroexpansion R02-D. Anker müssen Expand-Stelle **und** Definition umfassen. Ohne Expansion: **Unknown**, nicht „kein Finding“.

**Korpus scheitert:** R13 schützt vor Literal-Phantomen (CC-016), sagt aber nichts zu Makros. Ein Lexer ohne Expand liefert 0 UPDATEs — False Negative gegenüber CC-023.

### H-045/H-046 — RAP sieht aus wie A

```abap
METHOD read.
  READ ENTITIES OF i_salesordertp
    IN LOCAL MODE
    ENTITY salesorder
    ALL FIELDS WITH CORRESPONDING #( keys )
    RESULT DATA(lt_so)
    FAILED DATA(ls_failed).
  READ ENTITIES OF i_salesordertp
    WITH PRIVILEGED ACCESS
    ENTITY salesorder
    ALL FIELDS WITH CORRESPONDING #( keys )
    RESULT lt_so.
ENDMETHOD.
```

**Sollkandidat:** Released RAP-BO **kann** Cloud-usable sein. `IN LOCAL MODE` und `PRIVILEGED ACCESS` sind **keine** A-Unbedenklichkeit: DCL/Authority werden umgangen. Klassifikation: API-Oberfläche usable, Implementierung **security-restricted / nicht A**. Fachsatz „liest Kundenauftrag“ nur mit Flag-Kontext.

**Korpus scheitert:** Kein EML, kein DCL. CC-019 macht released RTTI zu `cloud usable` — dieselbe Heuristik hier wäre ein **kritischer False Green**.

### H-036 — GENERATE SUBROUTINE POOL

```abap
DATA lv_name TYPE syrepid.
DATA lt_code TYPE TABLE OF string.
APPEND `PROGRAM.` TO lt_code.
APPEND `FORM run. UPDATE kna1 SET land1 = 'DE'. ENDFORM.` TO lt_code.
GENERATE SUBROUTINE POOL lt_code NAME lv_name.
PERFORM run IN PROGRAM (lv_name) IF FOUND.
```

**Sollkandidat:** Statisch **kein** beweisbares D auf KNA1 (Code ist Datum), aber **kein** B. K11+K06+Security. R13: String ist nicht ausgeführt — **aber** GENERATE führt ihn danach aus. IF FOUND ≠ ausgeführt (CC-012).

**Korpus scheitert:** CC-016 (SQL nur im String = kein Finding) **widerspricht** diesem Fall, wenn R13 pauschal gilt. Zwei Regeln ohne Vorrang: R13 vs. R02/R07.

### H-016 — CLIENT SPECIFIED

```abap
FORM copy_cust USING iv_mnd TYPE mandt iv_kunnr TYPE kunnr.
  SELECT SINGLE * FROM kna1 CLIENT SPECIFIED
    INTO @DATA(ls)
    WHERE mandt = @iv_mnd AND kunnr = @iv_kunnr.
  ls-mandt = sy-mandt.
  INSERT kna1 CLIENT SPECIFIED FROM @ls.
ENDFORM.
```

**Sollkandidat:** Lesen **nicht** normales R01-C; Schreiben D **plus** Mandantenbruch. Nachfolger I_CUSTOMER ist **kein** Äquivalent. Prozess: Cross-Client-Kopie, nicht „Kundenliste“.

**Korpus scheitert:** R01/R02 ohne Mandantenachse. Engine, die `FROM kna1` matcht, liefert CC-001/023-Labels und damit die **falsche** fachliche Aussage.

### H-100 — CATCH cx_root / RETRY / CLEANUP

```abap
METHOD call_ext.
  DATA lv_try TYPE i.
  TRY.
      lv_try = lv_try + 1.
      CALL FUNCTION iv_func EXPORTING i = iv_i.
    CATCH cx_root.
      IF lv_try < 3.
        RETRY.
      ENDIF.
      RAISE EXCEPTION TYPE zcx_wrap.
    CLEANUP.
      ROLLBACK WORK.
  ENDTRY.
ENDMETHOD.
```

**Sollkandidat:** R07 unbekannter FM. R19: Normalpfad, Retry-Schleife, Catch-all, CLEANUP nur beim Unwind nach außen — **nicht** bei erfolgreichem Call und **nicht** identisch mit Catch. `ROLLBACK` im CLEANUP ändert LUW nur im Unwind.

**Korpus scheitert:** 0 TRY im Korpus. Ein Skelett ohne Retry würde „ein FM-Aufruf“ behaupten. CLEANUP=finally (Vorstudie RC-021) bleibt im Oracle ungetestet.

### H-058/H-063 — SAP-Host-Exit, nicht Z-Report

```abap
FORM userexit_save_document.
  IF vbak-netwr > 10000 AND vbak-vkorg = '1000'.
    vbak-lifsk = '01'.
  ENDIF.
  UPDATE zsd_block SET blocked = 'X' WHERE vbeln = vbak-vbeln.
ENDFORM.
```

**Sollkandidat:** Kontext SAP-Programm VA01/VA02, implizites/User-Exit-Modell: **D-Kandidat** für den SAP-Eingriff (R10), eigenes `zsd_block` nach R20 **nicht** D. Fachsätze brauchen VBAK-Felder aus dem Host, die im Z-Fragment nicht deklariert sind. Grenzwert 10000 inklusiv/exklusiv (R23) nur mit Typ NETWR.

**Korpus scheitert:** CC-010 braucht explizites Host-Fixture und warnt, ohne Metadata kein D. Reale Exits kommen als Include-Fragment **ohne** dieses Fixture. CC-024 würde `UPDATE zsd_block` als harmlos B sehen und den SAP-Struktur-Write auf `vbak-lifsk` übersehen (kein SQL).

**4. Systematische Lücken.**

| Lücke | Fälle (Anzahl) | Was der Korpus ändern müsste |
|---|---|---|
| Wirkung hinter Fassade/Transitivität/Makro | H-001–H-006, H-045–H-047, H-089, H-114, H-116 (~12) | Interprozedurale known-worst-Kette; Makroexpansion; RAP-Save-Body |
| FAE/SQL-Semantik jenseits Guard-IF | H-007–H-011, H-016–H-022, H-111, H-127–H-129 (~18) | Negativ-FAE; dynamisches OpenSQL; Mandant; Cursor/LUW; Proxy-Views |
| LUW / Update-Task / RFC / Job | H-023–H-035, H-084–H-090 (~20) | Knotentypen update_task, trfc, arfc, job, bapi_commit; Commit als Gate |
| Native/dynamischer Code | H-012–H-015, H-036–H-044, H-072–H-074 (~16) | EXEC/ADBC/AMDP/GENERATE; R13-Vorrang gegen Ausführung |
| RAP/EML/DCL-Bypass | H-045–H-049, H-115 (~6) | Neue Klasse; LOCAL MODE / PRIVILEGED nie zu A |
| SAP-Exit-/Customizing-Prozess | H-054–H-066, H-109–H-110, H-124 (~16) | Host-Objekt Pflicht; BTE/NAST/BRF+ als opaque customizing |
| Security ≠ Levelbuchstabe | H-067–H-076, H-092, H-125 (~12) | AuthC, usr02, OS, Kernel SYSTEM, SE16N; nicht R01-C |
| Kontrollfluss-Feinkorn | H-097–H-108, H-100–H-103, H-117–H-120 (~15) | CHECK-Scope, RETRY, ASSERT ID, Tabellenausdruck-Dump |
| Datenmodell S/4 | H-050–H-053, H-080–H-082 (~7) | CVI, ACDOCA, Proxy; Nachfolger nicht drop-in |
| Sprache/Profil | H-115 | dieselbe Zeile, zwei Editionen, zwei Urteile |

Plus: **Zeilenanker** bei Makro, Mehrstatement, Template-Call, dynamischem SQL — v1 zählt Zeilen, nicht Expansion/Spalte (Vorstudie F05 bleibt fachlich richtig).

**5. Was du am Korpus nicht widerlegen konntest.**

Nicht widerlegt (und bewusst so gelassen): die Selbstkennzeichnung *proposed oracle*; Trennung Classic-B vs. Cloud-not_usable (CC-004); Konstante vs. Variable bei `CALL FUNCTION` (R06, CC-006/011); CDS-Lesenachfolger ≠ Write (R02, CC-023); Kommentare/Literale sind keine Statements (R13, CC-016) **für den reinen Textfall**; fehlende Quelle ≠ SAP-C (R16, CC-022); Kernel ohne aktuelle Regel = Unknown (R12, CC-015); Dynpro ≠ automatisch D (R11); eigene Tabelle ≠ CAP-Pflicht (R20); `actual_hours = null`; leere Findingliste ≠ „fehlerfrei“.

Die bisherige Härtungsstudie **irrt**, wo sie TRY/CATCH/CHECK/Memory als zentrale Restlücke rahmt: das sind Parser-Lücken. Die **entscheidungsrelevanten** Lücken sind LUW, transitives D, dynamisches SQL, SAP-Exits, RAP-Flags und Mandant/Authority. Sie irrt auch methodisch, 103 korrelierte Methoden aus zwei Git-Projekten als „Realcode-Abnahme“ zu zählen — das ist Lexer-Regression, kein ERP-Korpus. Die 15 Comparator-False-Accepts habe ich **nicht** nachvollzogen (kein Lauf); ich widerspreche ihnen nicht, ich zähle sie nicht als meinen Beleg.

**6. Freigabeempfehlung.**

**Nicht freigeben** — auch nicht als „Ground Truth v1“ unter anderem Namen, solange der Vertrag 25 Mini-Reports und 34 Findings als hinreichend für reale Programme lesbar bleibt.

Der Korpus darf **Mikro-Regression** für die dokumentierten 24 Regeln bleiben, wenn jeder Export *candidate / not independently signed* trägt und explizit **Negativlisten** hat: keine Aussage über LUW, Makros, EML, Exits, dynamisches SQL, Security.

Auflagen, falls später „freigeben mit Auflagen“ erwogen wird:

- Mindestens die zehn ausgeschriebenen Fälle plus FAE-Negativ, CLIENT SPECIFIED, Update-Task, Makro-DML, RAP PRIVILEGED als versionierte Kandidaten mit eigenen Regeln.
- Native Katalogpins und unabhängige SAP-Adjudikation (der Autor darf nicht der Freigeber sein).
- Statement-IDs/Spalten; Makro- und Template-Expansion; known-worst transitiv.
- Engine-Lauf **ohne** Oracle-Copy; Comparator darf fehlende Pflichtclaims nicht akzeptieren (Vorstudie F01 — als Anforderung, nicht als von mir ausgeführter Beweis).
- Kein A aus „kein Finding“; kein B aus Klassennamen; Profil (Sprache/Edition) Teil des Schlüssels.
- Stichprobe aus **unabhängigen** ERP-Strata (MM/SD/FI/HR, BAPI, Dynpro, RAP), nicht noch mehr abapGit.