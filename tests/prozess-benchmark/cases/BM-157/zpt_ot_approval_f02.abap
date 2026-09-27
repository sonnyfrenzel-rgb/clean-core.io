*&---------------------------------------------------------------------*
*& Include ZPT_OT_APPROVAL_F02  - Benutzeraktionen
*&---------------------------------------------------------------------*

FORM user_command USING r_ucomm     TYPE sy-ucomm
                        rs_selfield TYPE slis_selfield.
  DATA ls_out TYPE ty_out.

  CASE r_ucomm.
    WHEN '&IC1'.
*     Doppelklick: Personalstammdaten anzeigen
      READ TABLE gt_out INTO ls_out INDEX rs_selfield-tabindex.
      CHECK sy-subrc = 0.
      SET PARAMETER ID 'PER' FIELD ls_out-pernr.
      CALL TRANSACTION 'PA20' AND SKIP FIRST SCREEN.
    WHEN 'ZAPPR'.
      PERFORM approve_selected.
    WHEN 'ZREJ'.
      PERFORM reject_selected.
    WHEN 'ZRETRO'.
      PERFORM schedule_time_evaluation.
    WHEN OTHERS.
      RETURN.
  ENDCASE.
  rs_selfield-refresh = abap_true.
ENDFORM.

*----------------------------------------------------------------------*
FORM approve_selected.
  DATA: ls_p2012  TYPE p2012,
        ls_return TYPE bapireturn1,
        lv_ok     TYPE i.

  AUTHORITY-CHECK OBJECT 'Z_PT_OT'
    ID 'ACTVT' FIELD '43'.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'Keine Freigabeberechtigung'.
  ENDIF.

  LOOP AT gt_out ASSIGNING FIELD-SYMBOL(<ls_out>)
       WHERE sel = abap_true.
    IF <ls_out>-status <> gc_open.
      CONTINUE.
    ENDIF.

    CALL FUNCTION 'HR_EMPLOYEE_ENQUEUE'
      EXPORTING
        number = <ls_out>-pernr
      IMPORTING
        return = ls_return.
    IF ls_return-type = 'E'.
      MESSAGE ls_return-message TYPE 'S' DISPLAY LIKE 'E'.
      CONTINUE.
    ENDIF.

*   Zeitumbuchungsvorgabe: Ueberschuss zur Auszahlung, Monatsletzter
    CLEAR ls_p2012.
    ls_p2012-pernr = <ls_out>-pernr.
    ls_p2012-infty = '2012'.
    ls_p2012-subty = gc_ztart_pay.
    ls_p2012-ztart = gc_ztart_pay.
    ls_p2012-begda = gv_endda.
    ls_p2012-endda = gv_endda.
    ls_p2012-anzhl = <ls_out>-excess.

    CALL FUNCTION 'HR_INFOTYPE_OPERATION'
      EXPORTING
        infty         = '2012'
        number        = <ls_out>-pernr
        subtype       = gc_ztart_pay
        validityend   = gv_endda
        validitybegin = gv_endda
        record        = ls_p2012
        operation     = 'INS'
        nocommit      = abap_true
      IMPORTING
        return        = ls_return.

    CALL FUNCTION 'HR_EMPLOYEE_DEQUEUE'
      EXPORTING
        number = <ls_out>-pernr.

    IF ls_return-type CA 'EA'.
      MESSAGE ls_return-message TYPE 'S' DISPLAY LIKE 'E'.
      CONTINUE.
    ENDIF.

    MODIFY zpt_ot_decision FROM @( VALUE #( pernr  = <ls_out>-pernr
                                            pabrj  = p_pabrj
                                            pabrp  = p_pabrp
                                            status = gc_approved
                                            hours  = <ls_out>-excess
                                            uname  = sy-uname
                                            datum  = sy-datum ) ).
    <ls_out>-status = gc_approved.
    lv_ok = lv_ok + 1.

    PERFORM notify_employee USING <ls_out>-pernr.
  ENDLOOP.

  IF lv_ok > 0.
    COMMIT WORK.
    MESSAGE s398(00) WITH lv_ok 'Freigaben gebucht'.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM reject_selected.
  DATA lv_cnt TYPE i.

  LOOP AT gt_out ASSIGNING FIELD-SYMBOL(<ls_out>)
       WHERE sel = abap_true AND status = gc_open.
    MODIFY zpt_ot_decision FROM @( VALUE #( pernr  = <ls_out>-pernr
                                            pabrj  = p_pabrj
                                            pabrp  = p_pabrp
                                            status = gc_rejected
                                            hours  = <ls_out>-excess
                                            uname  = sy-uname
                                            datum  = sy-datum ) ).
    <ls_out>-status = gc_rejected.
    lv_cnt = lv_cnt + 1.
  ENDLOOP.
  IF lv_cnt = 0.
    MESSAGE s398(00) WITH 'Keine offenen Zeilen markiert'.
    RETURN.
  ENDIF.
  COMMIT WORK.
ENDFORM.

*----------------------------------------------------------------------*
FORM notify_employee USING pv_pernr TYPE pernr_d.
  DATA: lv_objkey TYPE swo_typeid,
        lv_evtid  TYPE swe_evtid.

  lv_objkey = pv_pernr.
  CALL FUNCTION 'SWE_EVENT_CREATE'
    EXPORTING
      objtype           = 'ZPTOVERTIM'
      objkey            = lv_objkey
      event             = 'APPROVED'
    IMPORTING
      event_id          = lv_evtid
    EXCEPTIONS
      objtype_not_found = 1
      OTHERS            = 2.
  IF sy-subrc <> 0.
*   Benachrichtigung ist nicht kritisch
    MESSAGE s398(00) WITH 'Keine Benachrichtigung fuer' pv_pernr.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM schedule_time_evaluation.
  DATA: lr_pernr    TYPE RANGE OF pernr_d,
        lv_jobname  TYPE btcjob VALUE 'ZPT_OT_RPTIME00',
        lv_jobcount TYPE btcjobcnt.

  lr_pernr = VALUE #( FOR o IN gt_out WHERE ( sel = abap_true )
                      ( sign = 'I' option = 'EQ' low = o-pernr ) ).
  IF lr_pernr IS INITIAL.
    MESSAGE s398(00) WITH 'Keine Zeilen markiert'.
    RETURN.
  ENDIF.

  CALL FUNCTION 'JOB_OPEN'
    EXPORTING
      jobname          = lv_jobname
    IMPORTING
      jobcount         = lv_jobcount
    EXCEPTIONS
      cant_create_job  = 1
      invalid_job_data = 2
      jobname_missing  = 3
      OTHERS           = 4.
  IF sy-subrc <> 0.
    MESSAGE s398(00) DISPLAY LIKE 'E' WITH 'Job nicht anlegbar'.
    RETURN.
  ENDIF.

  SUBMIT rptime00
    WITH pnppernr IN lr_pernr
    WITH pnpbegda = gv_begda
    USING SELECTION-SET 'ZNACHLAUF'
    VIA JOB lv_jobname NUMBER lv_jobcount
    AND RETURN.

  CALL FUNCTION 'JOB_CLOSE'
    EXPORTING
      jobcount  = lv_jobcount
      jobname   = lv_jobname
      strtimmed = abap_true
    EXCEPTIONS
      OTHERS    = 1.
  MESSAGE s398(00) WITH 'Zeitauswertung eingeplant' lv_jobcount.
ENDFORM.
