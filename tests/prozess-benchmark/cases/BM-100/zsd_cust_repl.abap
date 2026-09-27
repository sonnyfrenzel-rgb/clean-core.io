*&---------------------------------------------------------------------*
*& Report ZSD_CUST_REPL
*&---------------------------------------------------------------------*
*& Replikation Kundenstamm an das Alt-CRM (Siebel) über Änderungszeiger
*& - Nachrichtentyp ZDEBMAS_CRM (Änderungszeiger aktiv für die Objekte
*&   DEBI und ADRESSE)
*& - Übertragung paketweise über Z_CRM_CUSTOMER_UPSERT (ruft intern den
*&   Siebel-Adapter), wahlweise parallel in einer RFC-Servergruppe
*& - erfolgreich übertragene Kunden: Änderungszeiger auf verarbeitet
*& Einplanung: stündlich, Reorganisation sonntags mit P_REORG
*&---------------------------------------------------------------------*
*& 2016-04  NB  Erstellung (Ablösung IDoc DEBMAS -> Siebel EAI)
*& 2016-09  NB  Parallelisierung über Servergruppe
*& 2018-02  NB  Anwendungslog statt Spool
*& 2020-11  KS  Geschäftspartnernummer aus CVI mitgeben (S/4-Vorbereitung)
*&---------------------------------------------------------------------*
REPORT zsd_cust_repl.

INCLUDE zsd_cust_repl_top.
INCLUDE zsd_cust_repl_f01.
INCLUDE zsd_cust_repl_f02.
INCLUDE zsd_cust_repl_f03.

START-OF-SELECTION.
  CALL FUNCTION 'CHANGE_POINTERS_READ'
    EXPORTING
      message_type                = p_mestyp
      read_not_processed_pointers = 'X'
    TABLES
      change_pointers             = gt_cp
    EXCEPTIONS
      OTHERS                      = 1.
  IF gt_cp IS INITIAL.
    MESSAGE s000(zsd_crm) WITH 'Keine offenen Änderungszeiger'.
    RETURN.
  ENDIF.

  gs_logh-object     = 'ZSD'.
  gs_logh-subobject  = 'CRM_REPL'.
  gs_logh-extnumber  = sy-repid.
  gs_logh-aldate_del = sy-datum + 14.
  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = gs_logh
    IMPORTING
      e_log_handle = gv_log
    EXCEPTIONS
      OTHERS       = 1.

  PERFORM collect_customers.
  PERFORM read_master_data.
  PERFORM build_packages.

  IF p_par = 'X'.
    PERFORM send_parallel.
  ELSE.
    PERFORM send_serial.
  ENDIF.

  PERFORM write_pointer_status.

  INSERT gv_log INTO TABLE gt_logh.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle = gt_logh
    EXCEPTIONS
      OTHERS         = 1.
  COMMIT WORK.

  IF p_reorg = 'X'.
*   verarbeitete und veraltete Änderungszeiger löschen (Standardreport)
    SUBMIT rbdcpclr WITH mestype = p_mestyp AND RETURN.
  ENDIF.
