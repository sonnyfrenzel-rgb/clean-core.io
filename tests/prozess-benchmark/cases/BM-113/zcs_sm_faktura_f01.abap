*----------------------------------------------------------------------*
***INCLUDE ZCS_SM_FAKTURA_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form CHECK_COSTS
*&---------------------------------------------------------------------*
* Istkosten des Auftrags (Werttyp 04) - ohne Kosten keine Anforderung
*----------------------------------------------------------------------*
FORM check_costs USING    ps_ord  TYPE ty_ord
                 CHANGING pv_skip TYPE abap_bool.
  DATA lv_sum TYPE coep-wkgbtr.

  SELECT SUM( wkgbtr ) FROM coep INTO lv_sum
    WHERE objnr = ps_ord-objnr
      AND wrttp = '04'.
  IF lv_sum <= 0.
    pv_skip = abap_true.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form BILL_BDC
*&---------------------------------------------------------------------*
* Fakturaanforderung über DP90 im Hintergrund erzeugen
*----------------------------------------------------------------------*
FORM bill_bdc USING ps_ord TYPE ty_ord.
  DATA: lv_vbeln TYPE vbak-vbeln,
        lv_datum TYPE c LENGTH 10,
        lv_text  TYPE bapi_msg.

  CLEAR: gt_bdc, gt_msg.
  WRITE p_bis TO lv_datum DD/MM/YYYY.

  bdc_dynpro 'SAPLAD15' '0100'.
  bdc_field  'AD15_S_ORDER-AUFNR' ps_ord-aufnr.
  bdc_field  'AD15_S_PROFILE'     ps_ord-dippr.
  bdc_field  'AD15_S_DATE'        lv_datum.
  bdc_field  'BDC_OKCODE'         '=SICH'.

  CALL TRANSACTION 'DP90' USING gt_bdc
                          MODE 'N'
                          UPDATE 'S'
                          MESSAGES INTO gt_msg.

* Erfolgsmeldung V1 311: "&1 &2 wurde gesichert" (&2 = Belegnummer)
  READ TABLE gt_msg INTO DATA(ls_msg)
       WITH KEY msgtyp = 'S' msgid = 'V1' msgnr = '311'.
  IF sy-subrc = 0.
    lv_vbeln = ls_msg-msgv2.
    INSERT zcs_sm_faklog FROM @( VALUE #( aufnr = ps_ord-aufnr
                                          vbeln = lv_vbeln
                                          erdat = sy-datum
                                          ernam = sy-uname ) ).
    COMMIT WORK.
    gv_ok = gv_ok + 1.
    PERFORM log_msg USING ps_ord-aufnr 'S' lv_vbeln.
  ELSE.
    gv_err = gv_err + 1.
    LOOP AT gt_msg INTO ls_msg WHERE msgtyp CA 'EA'.
      MESSAGE ID ls_msg-msgid TYPE 'E' NUMBER ls_msg-msgnr
              WITH ls_msg-msgv1 ls_msg-msgv2 ls_msg-msgv3 ls_msg-msgv4
              INTO lv_text.
      PERFORM log_msg USING ps_ord-aufnr 'E' lv_text.
    ENDLOOP.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form LOG_OPEN
*&---------------------------------------------------------------------*
FORM log_open.
  DATA ls_log TYPE bal_s_log.

  ls_log-object     = 'ZCS'.
  ls_log-subobject  = 'FAKTURA'.
  ls_log-aldate_del = sy-datum + 30.
  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = ls_log
    IMPORTING
      e_log_handle = gv_log
    EXCEPTIONS
      OTHERS       = 1.
  IF sy-subrc <> 0.
    MESSAGE a501(zcs).
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form LOG_MSG
*&---------------------------------------------------------------------*
FORM log_msg USING pv_aufnr TYPE aufk-aufnr
                   pv_type  TYPE symsgty
                   pv_text  TYPE csequence.
  DATA ls_msg TYPE bal_s_msg.

  ls_msg-msgty = pv_type.
  ls_msg-msgid = 'ZCS'.
  ls_msg-msgno = '510'.
  ls_msg-msgv1 = pv_aufnr.
  ls_msg-msgv2 = pv_text.
  CALL FUNCTION 'BAL_LOG_MSG_ADD'
    EXPORTING
      i_log_handle = gv_log
      i_s_msg      = ls_msg
    EXCEPTIONS
      OTHERS       = 1.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form LOG_SHOW
*&---------------------------------------------------------------------*
FORM log_show.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_save_all = 'X'
    EXCEPTIONS
      OTHERS     = 1.
* im Hintergrund schlägt die Anzeige fehl - wird bewusst ignoriert
  CALL FUNCTION 'BAL_DSP_LOG_DISPLAY'
    EXCEPTIONS
      OTHERS = 1.
ENDFORM.
