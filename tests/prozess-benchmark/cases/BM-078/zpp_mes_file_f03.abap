*&---------------------------------------------------------------------*
*& Include ZPP_MES_FILE_F03 - Anwendungs-Log
*&---------------------------------------------------------------------*
FORM log_anlegen.
  DATA ls_log TYPE bal_s_log.

  ls_log-object     = 'ZPP'.
  ls_log-subobject  = 'MESFILE'.
  ls_log-extnumber  = |{ p_werks } { sy-datum } { sy-uzeit }|.
  ls_log-aldate_del = sy-datum + 30.

  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = ls_log
    IMPORTING
      e_log_handle = gv_handle
    EXCEPTIONS
      OTHERS       = 1.
  IF sy-subrc <> 0.
*   ohne Log laeuft die Schnittstelle trotzdem
    CLEAR gv_handle.
  ENDIF.
ENDFORM.

FORM log_sichern.
  DATA: ls_log     TYPE ty_log,
        lt_handles TYPE bal_t_logh.

  IF gv_handle IS INITIAL.
    RETURN.
  ENDIF.

  LOOP AT gt_log INTO ls_log.
    CALL FUNCTION 'BAL_LOG_MSG_ADD_FREE_TEXT'
      EXPORTING
        i_log_handle = gv_handle
        i_msgty      = ls_log-msgty
        i_text       = ls_log-text
      EXCEPTIONS
        OTHERS       = 1.
  ENDLOOP.

  INSERT gv_handle INTO TABLE lt_handles.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle = lt_handles
    EXCEPTIONS
      OTHERS         = 1.
  COMMIT WORK.

* Job soll bei Fehlern rot werden, damit die Leitstelle es sieht
  IF gv_fehler > 0 AND sy-batch = abap_true.
    MESSAGE e300 WITH gv_fehler.
  ENDIF.
ENDFORM.
