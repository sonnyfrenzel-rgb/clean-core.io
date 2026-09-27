*----------------------------------------------------------------------*
***INCLUDE ZIF_INBOX_DISPATCH_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form DISPATCH - Nachricht an den konfigurierten Verarbeiter geben
*&---------------------------------------------------------------------*
FORM dispatch USING    ps_inbox TYPE zif_inbox
              CHANGING pv_rc    TYPE sy-subrc
                       pv_msg   TYPE bapi_msg.
  DATA: ls_route TYPE zif_routing,
        lv_fm    TYPE rs38l_fnam,
        lv_prog  TYPE programm,
        lv_form  TYPE c LENGTH 30.

  READ TABLE gt_route INTO ls_route
       WITH TABLE KEY mestyp = ps_inbox-mestyp.
  IF sy-subrc <> 0.
    pv_rc  = 8.
    pv_msg = |Keine aktive Route für { ps_inbox-mestyp }|.
    RETURN.
  ENDIF.

  CASE ls_route-kind.
    WHEN 'F'.
      lv_fm = ls_route-handler.
      CALL FUNCTION lv_fm
        EXPORTING
          is_inbox = ps_inbox
        IMPORTING
          ev_rc    = pv_rc
          ev_msg   = pv_msg
        EXCEPTIONS
          OTHERS   = 1.
      IF sy-subrc <> 0.
        pv_rc  = 8.
        pv_msg = |Ausnahme in { lv_fm }|.
      ENDIF.
    WHEN 'P'.
      lv_prog = ls_route-program.
      lv_form = ls_route-handler.
      PERFORM (lv_form) IN PROGRAM (lv_prog)
        USING ps_inbox CHANGING pv_rc pv_msg IF FOUND.
    WHEN 'S'.
      lv_prog = ls_route-program.
      SUBMIT (lv_prog) WITH p_msgid = ps_inbox-msgid AND RETURN.
      pv_rc = 0.
    WHEN OTHERS.
      pv_rc  = 8.
      pv_msg = |Routingart { ls_route-kind } unbekannt|.
  ENDCASE.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FINISH - Status der Nachricht fortschreiben
*&---------------------------------------------------------------------*
FORM finish USING ps_inbox TYPE zif_inbox
                  pv_rc    TYPE sy-subrc
                  pv_msg   TYPE bapi_msg.
  IF pv_rc = 0.
    UPDATE zif_inbox SET status    = 'S'
                         processed = sy-datum
      WHERE msgid = ps_inbox-msgid.
    COMMIT WORK.
    RETURN.
  ENDIF.

* Fehler: Änderungen des Verarbeiters verwerfen
  ROLLBACK WORK.
  IF ps_inbox-retry + 1 < p_retry.
    UPDATE zif_inbox SET status = 'R'
                         retry  = retry + 1
                         errmsg = pv_msg
      WHERE msgid = ps_inbox-msgid.
  ELSE.
    UPDATE zif_inbox SET status = 'E'
                         retry  = retry + 1
                         errmsg = pv_msg
      WHERE msgid = ps_inbox-msgid.
    PERFORM log_error USING ps_inbox pv_msg.
  ENDIF.
  COMMIT WORK.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form LOG_ERROR - endgültigen Fehler ins Anwendungslog
*&---------------------------------------------------------------------*
FORM log_error USING ps_inbox TYPE zif_inbox
                     pv_msg   TYPE bapi_msg.
  DATA ls_msg TYPE bal_s_msg.

  ls_msg-msgty = 'E'.
  ls_msg-msgid = 'ZIF'.
  ls_msg-msgno = '101'.
  ls_msg-msgv1 = ps_inbox-msgid.
  ls_msg-msgv2 = ps_inbox-mestyp.
  ls_msg-msgv3 = pv_msg(50).
  ls_msg-msgv4 = pv_msg+50(50).
  CALL FUNCTION 'BAL_LOG_MSG_ADD'
    EXPORTING
      i_log_handle = gv_log
      i_s_msg      = ls_msg
    EXCEPTIONS
      OTHERS       = 1.
ENDFORM.
