*&---------------------------------------------------------------------*
*& Report ZAPO_CIF_IMOD
*&---------------------------------------------------------------------*
*& CIF-Integrationsmodelle je Werk generieren (RIMODGEN) und
*& aktivieren (RIMODAC2), danach CIF-Ausgangsqueues ins APO prüfen.
*& Ersetzt die manuelle Pflege CFM1/CFM2 nach Werkseinführungen.
*& Einplanung: Job ZAPO_CIF_NACHT, Schritt 2 (nach ZMM_MARC_DISPO)
*&---------------------------------------------------------------------*
*& 2011-05 T.Heller      Erstversion
*& 2013-09 T.Heller      Queue-Prüfung + Anwendungslog (Objekt ZAPO)
*& 2016-02 SAP-Beratung  Wartezeit als Parameter, Makro für Log
*&---------------------------------------------------------------------*
REPORT zapo_cif_imod LINE-SIZE 255 NO STANDARD PAGE HEADING.

TABLES: t001w.

TYPES: BEGIN OF ty_werk,
         werks TYPE t001w-werks,
         name1 TYPE t001w-name1,
       END OF ty_werk,
       BEGIN OF ty_queue,
         qname  TYPE trfcqout-qname,
         qstate TYPE trfcqout-qstate,
       END OF ty_queue,
       BEGIN OF ty_log,
         msgty TYPE symsgty,
         werks TYPE werks_d,
         text  TYPE char200,
       END OF ty_log,
       ty_line(1024) TYPE c.

DATA: gt_werks  TYPE STANDARD TABLE OF ty_werk,
      gs_werks  TYPE ty_werk,
      gt_seltab TYPE STANDARD TABLE OF rsparams,
      gt_list   TYPE STANDARD TABLE OF abaplist,
      gt_ascii  TYPE STANDARD TABLE OF ty_line,
      gs_ascii  TYPE ty_line,
      gt_queue  TYPE STANDARD TABLE OF ty_queue,
      gs_queue  TYPE ty_queue,
      gt_log    TYPE STANDARD TABLE OF ty_log,
      gv_model  TYPE char10,
      gv_fehler TYPE abap_bool,
      gv_anz    TYPE i.

* Protokollzeile sammeln: &1 Typ, &2 Werk, &3 Text
DEFINE log_msg.
  APPEND VALUE #( msgty = &1 werks = &2 text = &3 ) TO gt_log.
END-OF-DEFINITION.

SELECT-OPTIONS: so_werks FOR t001w-werks OBLIGATORY.
PARAMETERS: p_logsys TYPE logsys OBLIGATORY DEFAULT 'APOCLNT100',
            p_prefx  TYPE char4 DEFAULT 'ZWK_',
            p_varnt  TYPE variant DEFAULT 'ZCIF_MAT_ALL',
            p_wait   TYPE i DEFAULT 60,
            p_test   AS CHECKBOX DEFAULT 'X'.

*AT SELECTION-SCREEN ON p_logsys.
*  SELECT SINGLE logsys FROM tbdls INTO p_logsys WHERE logsys = p_logsys.
*  IF sy-subrc <> 0.
*    MESSAGE e002(zapo) WITH p_logsys.
*  ENDIF.

START-OF-SELECTION.

  SELECT werks name1 FROM t001w INTO TABLE gt_werks
    WHERE werks IN so_werks.
  IF sy-subrc <> 0.
    log_msg 'E' space 'Keine Werke zur Selektion gefunden'.
    STOP.
  ENDIF.

  LOOP AT gt_werks INTO gs_werks.

    CONCATENATE p_prefx gs_werks-werks INTO gv_model.

*   Selektion RIMODGEN: Variante liefert Objekttypen (Material, Werk,
*   PDS, Bestände), hier nur Modellname, Zielsystem und Werk übersteuern
    CLEAR gt_seltab.
    APPEND VALUE #( selname = 'MODEL'   kind = 'P' low = gv_model ) TO gt_seltab.
    APPEND VALUE #( selname = 'LOGSYS'  kind = 'P' low = p_logsys ) TO gt_seltab.
    APPEND VALUE #( selname = 'APPLIC'  kind = 'P' low = 'PPDS' ) TO gt_seltab.
    APPEND VALUE #( selname = 'S_WERKS' kind = 'S' sign = 'I' option = 'EQ'
                    low = gs_werks-werks ) TO gt_seltab.

    SUBMIT rimodgen USING SELECTION-SET p_varnt
                    WITH SELECTION-TABLE gt_seltab
                    EXPORTING LIST TO MEMORY
                    AND RETURN.

    CALL FUNCTION 'LIST_FROM_MEMORY'
      TABLES
        listobject = gt_list
      EXCEPTIONS
        not_found  = 1
        OTHERS     = 2.
    IF sy-subrc <> 0.
      log_msg 'E' gs_werks-werks 'Generierung ohne Protokoll - Modell prüfen (CFM1)'.
      CONTINUE.
    ENDIF.

    CLEAR gt_ascii.
    CALL FUNCTION 'LIST_TO_ASCI'
      EXPORTING
        list_index = -1
      TABLES
        listasci   = gt_ascii
        listobject = gt_list
      EXCEPTIONS
        OTHERS     = 1.
    CALL FUNCTION 'LIST_FREE_MEMORY'
      TABLES
        listobject = gt_list.

*   Generierungsprotokoll nach Fehlertext durchsuchen
    gv_fehler = abap_false.
    LOOP AT gt_ascii INTO gs_ascii.
      IF gs_ascii CS 'Fehler' OR gs_ascii CS 'Error'.
        gv_fehler = abap_true.
        EXIT.
      ENDIF.
    ENDLOOP.

    IF gv_fehler = abap_true.
      log_msg 'E' gs_werks-werks 'Generierung fehlerhaft, Modell nicht aktiviert'.
      CONTINUE.
    ENDIF.

    IF p_test = abap_true.
      log_msg 'I' gs_werks-werks 'Testlauf: Modell generiert, nicht aktiviert'.
      CONTINUE.
    ENDIF.

*   Aktivieren: neue Version aktiv, alte Versionen desselben Modells
*   werden von RIMODAC2 deaktiviert
    SUBMIT rimodac2 WITH model   = gv_model
                    WITH logsys  = p_logsys
                    WITH apo_app = 'PPDS'
                    WITH p_activ = 'X'
                    EXPORTING LIST TO MEMORY
                    AND RETURN.
*   Liste wird nicht ausgewertet (war bis 2013 LIST_FROM_MEMORY + WRITE)

    log_msg 'S' gs_werks-werks 'Integrationsmodell aktiviert'.

  ENDLOOP.

* Queues nur nach echter Aktivierung prüfen
  CHECK p_test = abap_false.

* Erstversorgung läuft asynchron ins APO - kurz warten
  WAIT UP TO p_wait SECONDS.

  PERFORM check_queues.

END-OF-SELECTION.

  PERFORM log_save.


*&---------------------------------------------------------------------*
*&      Form  CHECK_QUEUES
*&---------------------------------------------------------------------*
*       CIF-Ausgangsqueues (CF*) zum APO auf Fehlerstatus prüfen
*----------------------------------------------------------------------*
FORM check_queues.

  DATA lv_dest TYPE rfcdest.

  SELECT SINGLE rfcdest FROM tblsysdest INTO lv_dest
    WHERE logsys = p_logsys.

  SELECT qname qstate FROM trfcqout INTO TABLE gt_queue
    WHERE qname LIKE 'CF%'
      AND dest  = lv_dest
      AND qstate IN ('SYSFAIL', 'CPICERR', 'STOP').
  IF sy-subrc <> 0.
    log_msg 'S' space 'CIF-Queues ohne Fehler'.
    RETURN.
  ENDIF.

  SORT gt_queue BY qname.

  LOOP AT gt_queue INTO gs_queue.
    AT NEW qname.
      gv_anz = 0.
    ENDAT.
    gv_anz = gv_anz + 1.
    AT END OF qname.
      log_msg 'E' space |Queue { gs_queue-qname } Status { gs_queue-qstate }: { gv_anz } LUW(s) (SMQ1)|.
    ENDAT.
  ENDLOOP.

ENDFORM.


*&---------------------------------------------------------------------*
*&      Form  LOG_SAVE
*&---------------------------------------------------------------------*
*       Gesammelte Meldungen ins Anwendungslog ZAPO / CIF_IMOD
*----------------------------------------------------------------------*
FORM log_save.

  DATA: ls_bal_log TYPE bal_s_log,
        lv_handle  TYPE balloghndl,
        ls_log     TYPE ty_log,
        lt_handle  TYPE bal_t_logh.

  ls_bal_log-object    = 'ZAPO'.
  ls_bal_log-subobject = 'CIF_IMOD'.
  ls_bal_log-extnumber = |{ p_logsys } { sy-datum DATE = ISO }|.
  ls_bal_log-aldate_del = sy-datum + 30.

  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = ls_bal_log
    IMPORTING
      e_log_handle = lv_handle
    EXCEPTIONS
      OTHERS       = 1.

  LOOP AT gt_log INTO ls_log.
    CALL FUNCTION 'BAL_LOG_MSG_ADD_FREE_TEXT'
      EXPORTING
        i_log_handle = lv_handle
        i_msgty      = ls_log-msgty
        i_text       = |{ ls_log-werks } { ls_log-text }|
      EXCEPTIONS
        OTHERS       = 1.
  ENDLOOP.

  APPEND lv_handle TO lt_handle.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle = lt_handle
    EXCEPTIONS
      OTHERS         = 1.

  IF sy-batch IS INITIAL.
    CALL FUNCTION 'BAL_DSP_LOG_DISPLAY'
      EXPORTING
        i_t_log_handle = lt_handle
      EXCEPTIONS
        OTHERS         = 1.
  ENDIF.

ENDFORM.
