*&---------------------------------------------------------------------*
*& Include ZPP_MASS_RELEASE_F03 - Anwendungs-Log und Ausgabe
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Ergebnis ins Anwendungs-Log ZPP/MASSREL
*&---------------------------------------------------------------------*
FORM protokoll_sichern.
  DATA: ls_log     TYPE bal_s_log,
        ls_msg     TYPE bal_s_msg,
        ls_res     TYPE zpp_s_rel_result,
        lt_handles TYPE bal_t_logh.

  ls_log-object    = 'ZPP'.
  ls_log-subobject = 'MASSREL'.
  ls_log-extnumber = |{ p_werks }/{ sy-datum }/{ sy-uzeit }|.
  ls_log-aldate_del = sy-datum + 90.

  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = ls_log
    IMPORTING
      e_log_handle = gv_handle
    EXCEPTIONS
      OTHERS       = 1.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  LOOP AT gt_result INTO ls_res.
    CLEAR ls_msg.
    ls_msg-msgty = SWITCH #( ls_res-status WHEN gc_st_ok   THEN 'S'
                                           WHEN gc_st_test THEN 'I'
                                           WHEN gc_st_lock THEN 'W'
                                           ELSE 'E' ).
    ls_msg-msgid = 'ZPP'.
    ls_msg-msgno = '210'.
    ls_msg-msgv1 = ls_res-aufnr.
    ls_msg-msgv2 = ls_res-text.
    CALL FUNCTION 'BAL_LOG_MSG_ADD'
      EXPORTING
        i_log_handle = gv_handle
        i_s_msg      = ls_msg
      EXCEPTIONS
        OTHERS       = 1.
  ENDLOOP.

  INSERT gv_handle INTO TABLE lt_handles.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle = lt_handles
    EXCEPTIONS
      OTHERS         = 1.
  IF sy-subrc = 0.
    COMMIT WORK.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Ausgabe: Job -> Summenliste ins Spool, Dialog -> ALV
*&---------------------------------------------------------------------*
FORM ausgabe.
  DATA: lo_alv  TYPE REF TO cl_salv_table,
        lv_ok   TYPE i,
        lv_err  TYPE i,
        lv_lock TYPE i,
        lv_test TYPE i,
        ls_res  TYPE zpp_s_rel_result.

  LOOP AT gt_result INTO ls_res.
    CASE ls_res-status.
      WHEN gc_st_ok.
        lv_ok = lv_ok + 1.
      WHEN gc_st_lock.
        lv_lock = lv_lock + 1.
      WHEN gc_st_test.
        lv_test = lv_test + 1.
      WHEN OTHERS.
        lv_err = lv_err + 1.
    ENDCASE.
  ENDLOOP.

  IF sy-batch = abap_true.
    WRITE: / 'Freigegeben:', lv_ok,
           / 'Gesperrt:   ', lv_lock,
           / 'Testlauf:   ', lv_test,
           / 'Fehler:     ', lv_err,
           / 'Pakete gesendet/empfangen:', gv_sent, gv_recv.
    RETURN.
  ENDIF.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv
                              CHANGING  t_table      = gt_result ).
      lo_alv->get_functions( )->set_all( abap_true ).
      lo_alv->display( ).
    CATCH cx_salv_msg.
      MESSAGE s205.
  ENDTRY.
ENDFORM.
