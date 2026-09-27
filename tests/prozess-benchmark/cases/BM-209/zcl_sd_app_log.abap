CLASS zcl_sd_app_log DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS constructor
      IMPORTING iv_object    TYPE balobj_d
                iv_subobject TYPE balsubobj.
    METHODS add_bapiret
      IMPORTING it_return TYPE bapiret2_t.
    METHODS add_exception
      IMPORTING ix_exc TYPE REF TO cx_root.
    METHODS save.
    METHODS show.

  PRIVATE SECTION.
    DATA mv_handle TYPE balloghndl.
ENDCLASS.



CLASS zcl_sd_app_log IMPLEMENTATION.

  METHOD constructor.
    DATA ls_log TYPE bal_s_log.
    ls_log-object    = iv_object.
    ls_log-subobject = iv_subobject.
    ls_log-aldate    = sy-datum.
    ls_log-altime    = sy-uzeit.
    ls_log-aluser    = sy-uname.
    ls_log-alprog    = sy-repid.
    CALL FUNCTION 'BAL_LOG_CREATE'
      EXPORTING
        i_s_log      = ls_log
      IMPORTING
        e_log_handle = mv_handle
      EXCEPTIONS
        OTHERS       = 1.
  ENDMETHOD.


  METHOD add_bapiret.
    DATA ls_msg TYPE bal_s_msg.
    LOOP AT it_return INTO DATA(ls_ret).
      ls_msg-msgty = ls_ret-type.
      ls_msg-msgid = ls_ret-id.
      ls_msg-msgno = ls_ret-number.
      ls_msg-msgv1 = ls_ret-message_v1.
      ls_msg-msgv2 = ls_ret-message_v2.
      ls_msg-msgv3 = ls_ret-message_v3.
      ls_msg-msgv4 = ls_ret-message_v4.
      CALL FUNCTION 'BAL_LOG_MSG_ADD'
        EXPORTING
          i_log_handle = mv_handle
          i_s_msg      = ls_msg
        EXCEPTIONS
          OTHERS       = 1.
    ENDLOOP.
  ENDMETHOD.


  METHOD add_exception.
    DATA ls_exc TYPE bal_s_exc.
    ls_exc-msgty     = 'E'.
    ls_exc-exception = ix_exc.
    CALL FUNCTION 'BAL_LOG_EXCEPTION_ADD'
      EXPORTING
        i_log_handle = mv_handle
        i_s_exc      = ls_exc
      EXCEPTIONS
        OTHERS       = 1.
  ENDMETHOD.


  METHOD save.
    DATA lt_handle TYPE bal_t_logh.
    APPEND mv_handle TO lt_handle.
    CALL FUNCTION 'BAL_DB_SAVE'
      EXPORTING
        i_t_log_handle = lt_handle
      EXCEPTIONS
        OTHERS         = 1.
    IF sy-subrc = 0.
      COMMIT WORK.
    ENDIF.
  ENDMETHOD.


  METHOD show.
    DATA lt_handle TYPE bal_t_logh.
    APPEND mv_handle TO lt_handle.
    CALL FUNCTION 'BAL_DSP_LOG_DISPLAY'
      EXPORTING
        i_t_log_handle = lt_handle
      EXCEPTIONS
        OTHERS         = 1.
  ENDMETHOD.

ENDCLASS.
