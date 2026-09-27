*&---------------------------------------------------------------------*
*& Include ZHR_EMP_EXPORT_F03 - Protokoll und Benachrichtigung
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form WRITE_LOG
*&---------------------------------------------------------------------*
FORM write_log.
  DATA ls_log TYPE zhr_export_log.

  ls_log-progname = sy-repid.
  ls_log-run_date = sy-datum.
  ls_log-run_time = sy-uzeit.
  ls_log-full     = p_full.
  ls_log-cnt_rec  = lines( gt_rec ).
  ls_log-cnt_err  = lines( gt_error ).
  IF gv_file_ok = 'X' AND gv_rfc_ok = 'X'.
    ls_log-status = 'S'.
  ELSE.
    ls_log-status = 'E'.
  ENDIF.
  INSERT zhr_export_log FROM ls_log.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SEND_ERROR_MAIL - Hinweis an die HR-IT-Verteilerliste
*&---------------------------------------------------------------------*
FORM send_error_mail.
  DATA: ls_doc  TYPE sodocchgi1,
        lt_body TYPE STANDARD TABLE OF solisti1,
        ls_body TYPE solisti1,
        lt_rcv  TYPE STANDARD TABLE OF somlreci1,
        ls_rcv  TYPE somlreci1,
        lv_n    TYPE i.

  ls_doc-obj_descr = 'Fehler Export Personalstamm'.
  lv_n = lines( gt_error ).
  ls_body-line = |{ lv_n } Fehler im Lauf vom { sy-datum DATE = USER }|.
  APPEND ls_body TO lt_body.
  ls_body-line = 'Details siehe Jobprotokoll'.
  APPEND ls_body TO lt_body.

  ls_rcv-receiver = p_mail.
  ls_rcv-rec_type = 'C'.
  APPEND ls_rcv TO lt_rcv.

  CALL FUNCTION 'SO_NEW_DOCUMENT_SEND_API1'
    EXPORTING
      document_data  = ls_doc
      document_type  = 'RAW'
      commit_work    = space
    TABLES
      object_content = lt_body
      receivers      = lt_rcv
    EXCEPTIONS
      OTHERS         = 1.
  IF sy-subrc <> 0.
    MESSAGE w053(zhr_if).
  ENDIF.
ENDFORM.
