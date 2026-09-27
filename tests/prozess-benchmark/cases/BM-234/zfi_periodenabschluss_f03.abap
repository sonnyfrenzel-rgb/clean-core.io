*&---------------------------------------------------------------------*
*&  Include           ZFI_PERIODENABSCHLUSS_F03
*&  Anwendungslog
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  LOG_ANLEGEN
*&---------------------------------------------------------------------*
FORM log_anlegen.
  DATA ls_log TYPE bal_s_log.

  ls_log-object    = gc_balobj.
  ls_log-subobject = gc_balsub.
  CONCATENATE p_bukrs p_gjahr p_monat INTO ls_log-extnumber
    SEPARATED BY '/'.
  ls_log-aluser    = sy-uname.
  ls_log-alprog    = sy-repid.

  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = ls_log
    IMPORTING
      e_log_handle = gv_log_handle
    EXCEPTIONS
      OTHERS       = 1.
  IF sy-subrc <> 0.
    MESSAGE a010.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  LOG_MELDUNG
*&---------------------------------------------------------------------*
*       Achtung: zaehlt Fehler und Warnungen mit - gv_fehler steuert
*       im Hauptprogramm, ob abgeschlossen wird!
*----------------------------------------------------------------------*
FORM log_meldung USING pv_typ  TYPE symsgty
                       pv_text TYPE c.
  CALL FUNCTION 'BAL_LOG_MSG_ADD_FREE_TEXT'
    EXPORTING
      i_log_handle = gv_log_handle
      i_msgty      = pv_typ
      i_text       = pv_text
    EXCEPTIONS
      OTHERS       = 1.

  CASE pv_typ.
    WHEN 'E'.
      ADD 1 TO gv_fehler.
    WHEN 'W'.
      ADD 1 TO gv_warnung.
  ENDCASE.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  LOG_SICHERN
*&---------------------------------------------------------------------*
FORM log_sichern.
  DATA lt_handle TYPE bal_t_logh.

* Testlauf wird nicht gesichert
  IF p_test = 'X'.
    RETURN.
  ENDIF.

  APPEND gv_log_handle TO lt_handle.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle = lt_handle
    EXCEPTIONS
      OTHERS         = 1.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  LOG_ANZEIGEN
*&---------------------------------------------------------------------*
FORM log_anzeigen.
* im Hintergrund landet das Log nur in der Datenbank
  CHECK sy-batch IS INITIAL.

  CALL FUNCTION 'BAL_DSP_LOG_DISPLAY'
    EXCEPTIONS
      OTHERS = 1.
ENDFORM.
