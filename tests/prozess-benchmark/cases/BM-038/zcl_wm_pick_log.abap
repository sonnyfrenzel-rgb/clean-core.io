*----------------------------------------------------------------------*
* Anwendungsprotokoll-Kapsel fuer WM-Kommissionierung (Objekt ZWM/WAVE)
*----------------------------------------------------------------------*
CLASS zcl_wm_pick_log DEFINITION
  PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING iv_extnumber TYPE clike.
    METHODS add
      IMPORTING iv_type TYPE symsgty
                iv_text TYPE clike.
    METHODS add_sy.
    METHODS save.
    METHODS display.
  PRIVATE SECTION.
    DATA mv_handle TYPE balloghndl.
ENDCLASS.

CLASS zcl_wm_pick_log IMPLEMENTATION.

  METHOD constructor.
    DATA ls_log TYPE bal_s_log.
    ls_log-object     = 'ZWM'.
    ls_log-subobject  = 'WAVE'.
    ls_log-extnumber  = iv_extnumber.
    ls_log-aluser     = sy-uname.
    ls_log-alprog     = sy-repid.
    ls_log-aldate_del = sy-datum + 30.
    CALL FUNCTION 'BAL_LOG_CREATE'
      EXPORTING
        i_s_log      = ls_log
      IMPORTING
        e_log_handle = mv_handle
      EXCEPTIONS
        OTHERS       = 1.
  ENDMETHOD.

  METHOD add.
    DATA lv_text TYPE char200.
    lv_text = iv_text.
    CALL FUNCTION 'BAL_LOG_MSG_ADD_FREE_TEXT'
      EXPORTING
        i_log_handle = mv_handle
        i_msgty      = iv_type
        i_text       = lv_text
      EXCEPTIONS
        OTHERS       = 1.
  ENDMETHOD.

  METHOD add_sy.
    DATA ls_msg TYPE bal_s_msg.
    ls_msg-msgty = sy-msgty.
    ls_msg-msgid = sy-msgid.
    ls_msg-msgno = sy-msgno.
    ls_msg-msgv1 = sy-msgv1.
    ls_msg-msgv2 = sy-msgv2.
    ls_msg-msgv3 = sy-msgv3.
    ls_msg-msgv4 = sy-msgv4.
    IF ls_msg-msgty IS INITIAL.
      ls_msg-msgty = 'E'.
    ENDIF.
    CALL FUNCTION 'BAL_LOG_MSG_ADD'
      EXPORTING
        i_log_handle = mv_handle
        i_s_msg      = ls_msg
      EXCEPTIONS
        OTHERS       = 1.
  ENDMETHOD.

  METHOD save.
    DATA lt_handle TYPE bal_t_logh.
    INSERT mv_handle INTO TABLE lt_handle.
    CALL FUNCTION 'BAL_DB_SAVE'
      EXPORTING
        i_t_log_handle = lt_handle
      EXCEPTIONS
        OTHERS         = 1.
    COMMIT WORK.
  ENDMETHOD.

  METHOD display.
    DATA lt_handle TYPE bal_t_logh.
    INSERT mv_handle INTO TABLE lt_handle.
    CALL FUNCTION 'BAL_DSP_LOG_DISPLAY'
      EXPORTING
        i_t_log_handle = lt_handle
      EXCEPTIONS
        OTHERS         = 1.
  ENDMETHOD.

ENDCLASS.
