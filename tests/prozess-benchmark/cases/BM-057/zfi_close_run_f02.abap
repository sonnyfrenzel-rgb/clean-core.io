*&---------------------------------------------------------------------*
*&  Include           ZFI_CLOSE_RUN_F02
*&---------------------------------------------------------------------*
* Ausfuehrung der Abschlussschritte
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  EXECUTE_STEPS
*&---------------------------------------------------------------------*
*  Schrittliste abarbeiten. Schritttypen:
*   F = FORM-Routine aus Customizing     B = Funktionsbaustein
*   A = Abgrenzungen buchen              S = Standardprogramm (SUBMIT)
*   P = Pruefung parallel je Buchungskreis
*----------------------------------------------------------------------*
FORM execute_steps.

  DATA: lv_fname TYPE rs38l_fnam.

  LOOP AT gt_steps INTO gs_step.

*   Restart: Schritt schon erfolgreich gelaufen -> ueberspringen
    READ TABLE gt_stat INTO gs_stat
         WITH KEY stepid = gs_step-stepid
                  status = 'S'.
    IF sy-subrc = 0.
      CONTINUE.
    ENDIF.

    CLEAR gv_rc.
    CASE gs_step-steptype.
      WHEN 'F'.
*       Kundenroutine - Programm und FORM stehen im Customizing
        PERFORM (gs_step-formname) IN PROGRAM (gs_step-progname)
          IF FOUND
          USING p_gjahr p_monat
          CHANGING gv_rc.
      WHEN 'B'.
*       Funktionsbaustein aus Customizing (Schnittstelle per Konvention)
        lv_fname = gs_step-funcname.
        CALL FUNCTION lv_fname
          EXPORTING
            it_bukrs = gt_bukrs
            iv_gjahr = p_gjahr
            iv_monat = p_monat
            iv_test  = p_test
          IMPORTING
            ev_rc    = gv_rc.
      WHEN 'A'.
        PERFORM post_accruals CHANGING gv_rc.
      WHEN 'S'.
        PERFORM submit_program CHANGING gv_rc.
      WHEN 'P'.
        PERFORM run_parallel CHANGING gv_rc.
*     WHEN 'T'.   "F.13 per CALL TRANSACTION - 2014 raus, lief nie sauber
*       CALL TRANSACTION 'F.13' USING gt_bdc MODE 'N'.
      WHEN OTHERS.
        gv_rc = 8.
    ENDCASE.

*   Status je Schritt fortschreiben
    gs_stat-runid  = p_runid.
    gs_stat-gjahr  = p_gjahr.
    gs_stat-monat  = p_monat.
    gs_stat-stepid = gs_step-stepid.
    gs_stat-rc     = gv_rc.
    gs_stat-status = COND #( WHEN gv_rc = 0 THEN 'S' ELSE 'E' ).
    gs_stat-uname  = sy-uname.
    gs_stat-datum  = sy-datum.
    gs_stat-uzeit  = sy-uzeit.
    MODIFY zfi_close_stat FROM gs_stat.
    COMMIT WORK.

*   kritischer Schritt fehlerhaft -> Lauf abbrechen
    IF gv_rc <> 0 AND gs_step-critical = abap_true.
      gv_abort = abap_true.
      mac_log 'E' '032' gs_step-stepid gv_rc.
      EXIT.
    ENDIF.
*   nicht kritisch: weiter mit naechstem Schritt
*   (frueher MESSAGE w - im Batch sinnlos)
  ENDLOOP.

ENDFORM.                    "execute_steps

*&---------------------------------------------------------------------*
*&      Form  POST_ACCRUALS
*&---------------------------------------------------------------------*
*  Abgrenzungen aus ZFI_ACCRUAL buchen (Aufwand an passive Abgrenzung)
*----------------------------------------------------------------------*
FORM post_accruals CHANGING cv_rc TYPE sy-subrc.

  DATA: lt_accr   TYPE STANDARD TABLE OF zfi_accrual,
        ls_accr   TYPE zfi_accrual,
        ls_head   TYPE bapiache09,
        lt_gl     TYPE STANDARD TABLE OF bapiacgl09,
        lt_amt    TYPE STANDARD TABLE OF bapiaccr09,
        lt_ret    TYPE STANDARD TABLE OF bapiret2,
        ls_ret    TYPE bapiret2,
        lv_objkey TYPE bapiache09-obj_key,
        lv_belnr  TYPE belnr_d.

* FOR ALL ENTRIES: gt_bukrs ist hier nie leer (siehe START-OF-SELECTION)
  SELECT * FROM zfi_accrual INTO TABLE lt_accr
    FOR ALL ENTRIES IN gt_bukrs
    WHERE bukrs  = gt_bukrs-table_line
      AND gjahr  = p_gjahr
      AND monat  = p_monat
      AND posted = space.

  LOOP AT lt_accr INTO ls_accr.
    CLEAR: ls_head, lt_gl, lt_amt, lt_ret, lv_objkey.
    ls_head-bus_act    = 'RFBU'.
    ls_head-username   = sy-uname.
    ls_head-comp_code  = ls_accr-bukrs.
    ls_head-doc_date   = p_budat.
    ls_head-pstng_date = p_budat.
    ls_head-fisc_year  = p_gjahr.
    ls_head-fis_period = p_monat.
    ls_head-doc_type   = 'SA'.
    ls_head-header_txt = |Abgrenzung { p_monat }/{ p_gjahr }|.
    ls_head-ref_doc_no = ls_accr-lfdnr.

*   Soll Aufwand (mit Kostenstelle) an Haben passive Abgrenzung
    APPEND VALUE #( itemno_acc = 1 gl_account = ls_accr-hkont_aufw
                    costcenter = ls_accr-kostl item_text = ls_accr-sgtxt ) TO lt_gl.
    APPEND VALUE #( itemno_acc = 2 gl_account = ls_accr-hkont_abgr
                    item_text = ls_accr-sgtxt ) TO lt_gl.
    APPEND VALUE #( itemno_acc = 1 currency = ls_accr-waers amt_doccur = ls_accr-betrag ) TO lt_amt.
    APPEND VALUE #( itemno_acc = 2 currency = ls_accr-waers amt_doccur = - ls_accr-betrag ) TO lt_amt.

    IF p_test = abap_true.
*     Testlauf: Beleg nur pruefen
      CALL FUNCTION 'BAPI_ACC_DOCUMENT_CHECK'
        EXPORTING
          documentheader = ls_head
        TABLES
          accountgl      = lt_gl
          currencyamount = lt_amt
          return         = lt_ret.
    ELSE.
      CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
        EXPORTING
          documentheader = ls_head
        IMPORTING
          obj_key        = lv_objkey
        TABLES
          accountgl      = lt_gl
          currencyamount = lt_amt
          return         = lt_ret.
    ENDIF.

    READ TABLE lt_ret INTO ls_ret WITH KEY type = 'E'.
    IF sy-subrc = 0.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      cv_rc = 4.
      mac_log 'E' '040' ls_accr-bukrs ls_ret-message.
    ELSE.
      IF p_test = abap_false.
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = abap_true.
*       Abgrenzung als gebucht kennzeichnen (Belegnr. = OBJ_KEY 1-10)
        lv_belnr = lv_objkey(10).
        UPDATE zfi_accrual SET posted = abap_true
                               belnr  = lv_belnr
          WHERE bukrs = ls_accr-bukrs
            AND gjahr = ls_accr-gjahr
            AND monat = ls_accr-monat
            AND lfdnr = ls_accr-lfdnr.
      ENDIF.
    ENDIF.
  ENDLOOP.

ENDFORM.                    "post_accruals

*&---------------------------------------------------------------------*
*&      Form  SUBMIT_PROGRAM
*&---------------------------------------------------------------------*
*  Standardprogramme einplanen (synchron im selben Job)
*----------------------------------------------------------------------*
FORM submit_program CHANGING cv_rc TYPE sy-subrc.

  DATA lv_bukrs TYPE bukrs.

  CASE gs_step-progname.
    WHEN 'RAPOST2000'.
*     Abschreibungslauf je Buchungskreis (nicht parallel - AfA-Sperre!)
      LOOP AT gt_bukrs INTO lv_bukrs.
        SUBMIT rapost2000
          WITH bukrs    = lv_bukrs
          WITH gjahr    = p_gjahr
          WITH peraf    = p_monat
          WITH testlauf = p_test
          AND RETURN.
      ENDLOOP.
    WHEN OTHERS.
*     sonstige Standardprogramme mit Variante aus dem Customizing
*     (z.B. RKO7KO8G Abrechnung, SAPF124 Ausgleich)
      SUBMIT (gs_step-progname)
        USING SELECTION-SET gs_step-variant
        AND RETURN.
  ENDCASE.

* Ergebnis der Programme wird nicht ausgewertet (Spool/Joblog pruefen)
  cv_rc = 0.

ENDFORM.                    "submit_program

*&---------------------------------------------------------------------*
*&      Form  RUN_PARALLEL
*&---------------------------------------------------------------------*
*  Pruefung je Buchungskreis parallel (aRFC in Servergruppe)
*----------------------------------------------------------------------*
FORM run_parallel CHANGING cv_rc TYPE sy-subrc.

  DATA: lv_bukrs TYPE bukrs,
        lv_task  TYPE char32.

  CLEAR: gv_sent, gv_recv, gv_failed, gv_perr.

  LOOP AT gt_bukrs INTO lv_bukrs.
    lv_task = |CLOSE_{ lv_bukrs }|.
    CALL FUNCTION 'Z_FI_CLOSE_STEP_BUKRS'
      STARTING NEW TASK lv_task
      DESTINATION IN GROUP p_rfcgr
      PERFORMING receive_result ON END OF TASK
      EXPORTING
        iv_bukrs              = lv_bukrs
        iv_gjahr              = p_gjahr
        iv_monat              = p_monat
      EXCEPTIONS
        system_failure        = 1 MESSAGE gv_msg
        communication_failure = 2 MESSAGE gv_msg
        resource_failure      = 3
        OTHERS                = 4.
    IF sy-subrc = 0.
      gv_sent = gv_sent + 1.
    ELSE.
*     keine freie Ressource / RFC-Fehler: Buchungskreis gilt als fehlerhaft
      gv_failed = gv_failed + 1.
      mac_log 'E' '050' lv_bukrs gv_msg.
    ENDIF.
  ENDLOOP.

* auf alle Rueckmeldungen warten (max. 30 Minuten)
  WAIT UNTIL gv_recv >= gv_sent UP TO 1800 SECONDS.
  IF sy-subrc <> 0 OR gv_failed > 0 OR gv_perr > 0.
    cv_rc = 4.
  ENDIF.

ENDFORM.                    "run_parallel

*&---------------------------------------------------------------------*
*&      Form  RECEIVE_RESULT
*&---------------------------------------------------------------------*
*  Callback ON END OF TASK
*----------------------------------------------------------------------*
FORM receive_result USING iv_task TYPE clike.

  DATA: lv_rc  TYPE sy-subrc,
        lv_msg TYPE bapi_msg.

  RECEIVE RESULTS FROM FUNCTION 'Z_FI_CLOSE_STEP_BUKRS'
    IMPORTING
      ev_rc                 = lv_rc
      ev_msg                = lv_msg
    EXCEPTIONS
      system_failure        = 1 MESSAGE lv_msg
      communication_failure = 2 MESSAGE lv_msg
      OTHERS                = 3.
  IF sy-subrc <> 0 OR lv_rc <> 0.
    gv_perr = gv_perr + 1.
    mac_log 'E' '051' iv_task lv_msg.
  ENDIF.
  gv_recv = gv_recv + 1.

ENDFORM.                    "receive_result
