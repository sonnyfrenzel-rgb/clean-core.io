*----------------------------------------------------------------------*
* Include ZMM_STO_NACHSCHUB_F02 - Protokoll, Uebergabe, Liste
*----------------------------------------------------------------------*

FORM log_anlegen.
  DATA ls_log TYPE bal_s_log.
  ls_log-object     = 'ZMM'.
  ls_log-subobject  = 'STO'.
  ls_log-extnumber  = |Nachschub { p_date DATE = USER }|.
  ls_log-aldate_del = sy-datum + 60.
  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = ls_log
    IMPORTING
      e_log_handle = gv_log
    EXCEPTIONS
      OTHERS       = 1.
ENDFORM.

*----------------------------------------------------------------------*
FORM log_meldung USING pv_typ   TYPE symsgty
                       pv_text  TYPE csequence
                       pv_werks TYPE werks_d.
  DATA lv_text TYPE char200.
  IF pv_werks IS INITIAL.
    lv_text = pv_text.
  ELSE.
    lv_text = |{ pv_werks }: { pv_text }|.
  ENDIF.
  CALL FUNCTION 'BAL_LOG_MSG_ADD_FREE_TEXT'
    EXPORTING
      i_log_handle = gv_log
      i_msgty      = pv_typ
      i_text       = lv_text
    EXCEPTIONS
      OTHERS       = 1.
ENDFORM.

*----------------------------------------------------------------------*
FORM log_sichern.
  DATA lt_handle TYPE bal_t_logh.
  APPEND gv_log TO lt_handle.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle = lt_handle
    EXCEPTIONS
      OTHERS         = 1.
  IF sy-subrc = 0.
    COMMIT WORK.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM uebergabe_folgejob.
* Folgejob ZMM_STO_AVIS liest die angelegten Lieferungen fuer das
* Avis an die Filialen (Schluessel ZSTO + Datum)
  DATA lv_id TYPE indx-srtfd.

  IF p_test = abap_true.
    RETURN.
  ENDIF.
  DELETE gt_result WHERE vbeln IS INITIAL.
  lv_id = |ZSTO{ p_date }|.
  EXPORT result = gt_result TO DATABASE indx(zs) ID lv_id.
  COMMIT WORK.
ENDFORM.

*----------------------------------------------------------------------*
FORM liste_ausgeben.
  DATA: lv_ok  TYPE i,
        lv_err TYPE i.

  FORMAT COLOR COL_HEADING.
  WRITE: / 'Filialnachschub fuer', p_date DD/MM/YYYY.
  IF p_test = abap_true.
    WRITE 'Testlauf'.
  ENDIF.
  FORMAT COLOR OFF.
  ULINE.
  LOOP AT gt_result INTO DATA(ls_res).
    IF ls_res-ebeln IS INITIAL OR ( p_test = abap_false AND ls_res-vbeln IS INITIAL ).
      FORMAT COLOR COL_NEGATIVE.
      lv_err = lv_err + 1.
    ELSE.
      FORMAT COLOR COL_POSITIVE.
      lv_ok = lv_ok + 1.
    ENDIF.
    WRITE: / ls_res-werks, ls_res-reswk, ls_res-anz, ls_res-ebeln,
             ls_res-vbeln, ls_res-wa, ls_res-text.
    FORMAT COLOR OFF.
  ENDLOOP.
  ULINE.
  WRITE: / 'Filialen ok:', lv_ok, 'mit Fehler:', lv_err.
ENDFORM.
