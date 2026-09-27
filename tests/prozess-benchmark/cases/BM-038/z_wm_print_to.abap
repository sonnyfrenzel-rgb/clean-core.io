FUNCTION z_wm_print_to.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle (RFC-faehig):
*"  IMPORTING
*"     VALUE(IV_LGNUM) TYPE  LGNUM
*"     VALUE(IV_TANUM) TYPE  TANUM
*"     VALUE(IV_LDEST) TYPE  RSPOPNAME
*"  EXPORTING
*"     VALUE(EV_SPOOL) TYPE  RSPOID
*"  EXCEPTIONS
*"      PRINT_ERROR
*"----------------------------------------------------------------------
* Kommissionierliste zum TA als Smart Form ZWM_PICKLIST drucken.
* Formular je Lagernummer aus ZWM_FORM (Default ZWM_PICKLIST).
  DATA: ls_ltak    TYPE ltak,
        lt_ltap    TYPE STANDARD TABLE OF ltap,
        lv_form    TYPE tdsfname,
        lv_fm      TYPE rs38l_fnam,
        ls_ctrl    TYPE ssfctrlop,
        ls_outopt  TYPE ssfcompop,
        ls_jobinfo TYPE ssfcrescl.

  SELECT SINGLE * FROM ltak INTO ls_ltak
    WHERE lgnum = iv_lgnum
      AND tanum = iv_tanum.
  IF sy-subrc <> 0.
    RAISE print_error.
  ENDIF.
  SELECT * FROM ltap INTO TABLE lt_ltap
    WHERE lgnum = iv_lgnum
      AND tanum = iv_tanum
    ORDER BY vltyp vlpla.

  SELECT SINGLE formname FROM zwm_form INTO lv_form
    WHERE lgnum = iv_lgnum.
  IF sy-subrc <> 0.
    lv_form = 'ZWM_PICKLIST'.
  ENDIF.

  CALL FUNCTION 'SSF_FUNCTION_MODULE_NAME'
    EXPORTING
      formname           = lv_form
    IMPORTING
      fm_name            = lv_fm
    EXCEPTIONS
      no_form            = 1
      no_function_module = 2
      OTHERS             = 3.
  IF sy-subrc <> 0.
    RAISE print_error.
  ENDIF.

  ls_ctrl-no_dialog = abap_true.
  ls_ctrl-getotf    = abap_false.
  ls_outopt-tddest  = iv_ldest.
  ls_outopt-tdimmed = abap_true.
  ls_outopt-tdnewid = abap_true.

  CALL FUNCTION lv_fm
    EXPORTING
      control_parameters = ls_ctrl
      output_options     = ls_outopt
      user_settings      = space
      is_ltak            = ls_ltak
    IMPORTING
      job_output_info    = ls_jobinfo
    TABLES
      it_ltap            = lt_ltap
    EXCEPTIONS
      formatting_error   = 1
      internal_error     = 2
      send_error         = 3
      user_canceled      = 4
      OTHERS             = 5.
  IF sy-subrc <> 0.
    RAISE print_error.
  ENDIF.

  READ TABLE ls_jobinfo-spoolids INTO ev_spool INDEX 1.

* Druckkennzeichen am TA setzen (Nachdruck erkennbar)
  UPDATE ltak SET drukz = 'X'
    WHERE lgnum = iv_lgnum
      AND tanum = iv_tanum.
  COMMIT WORK.

ENDFUNCTION.
