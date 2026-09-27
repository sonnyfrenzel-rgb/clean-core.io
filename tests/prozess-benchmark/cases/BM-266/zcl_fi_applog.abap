CLASS zcl_fi_applog DEFINITION
  PUBLIC
  CREATE PRIVATE.
* Kapselung Application Log fuer FI-Schnittstellen (Objekt ZFI, Unterobjekte je Schnittstelle)
  PUBLIC SECTION.
    CLASS-METHODS create
      IMPORTING iv_subobject  TYPE balsubobj
                iv_extnumber  TYPE balnrext OPTIONAL
      RETURNING VALUE(ro_log) TYPE REF TO zcl_fi_applog
      RAISING   zcx_fi_applog.
    METHODS add_bapiret2
      IMPORTING it_return TYPE bapiret2_t.
    METHODS has_errors
      RETURNING VALUE(rv_error) TYPE abap_bool.
    METHODS save
      IMPORTING iv_commit TYPE abap_bool DEFAULT abap_false.
  PRIVATE SECTION.
    DATA: mv_handle    TYPE balloghndl,
          mv_err_count TYPE i.
ENDCLASS.



CLASS zcl_fi_applog IMPLEMENTATION.

  METHOD create.
    DATA ls_log TYPE bal_s_log.

    ls_log-object    = 'ZFI'.
    ls_log-subobject = iv_subobject.
    ls_log-extnumber = iv_extnumber.
    ls_log-aluser    = sy-uname.
    ls_log-alprog    = sy-cprog.
    ls_log-aldate_del = sy-datum + 90.    "Aufbewahrung 90 Tage (Revision)

    ro_log = NEW #( ).
    CALL FUNCTION 'BAL_LOG_CREATE'
      EXPORTING
        i_s_log      = ls_log
      IMPORTING
        e_log_handle = ro_log->mv_handle
      EXCEPTIONS
        OTHERS       = 1.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_fi_applog
        EXPORTING textid = zcx_fi_applog=>log_not_created.
    ENDIF.
  ENDMETHOD.


  METHOD add_bapiret2.
    DATA ls_msg TYPE bal_s_msg.

    LOOP AT it_return INTO DATA(ls_ret).
*     Erfolgsmeldungen der BAPIs fluten das Protokoll -> weglassen
      CHECK ls_ret-type <> 'S'.
      CLEAR ls_msg.
      ls_msg-msgty = ls_ret-type.
      ls_msg-msgid = ls_ret-id.
      ls_msg-msgno = ls_ret-number.
      ls_msg-msgv1 = ls_ret-message_v1.
      ls_msg-msgv2 = ls_ret-message_v2.
      ls_msg-msgv3 = ls_ret-message_v3.
      ls_msg-msgv4 = ls_ret-message_v4.
      CASE ls_ret-type.
        WHEN 'E' OR 'A' OR 'X'.
          ls_msg-probclass = '1'.
          mv_err_count = mv_err_count + 1.
        WHEN 'W'.
          ls_msg-probclass = '2'.
        WHEN OTHERS.
          ls_msg-probclass = '4'.
      ENDCASE.
      CALL FUNCTION 'BAL_LOG_MSG_ADD'
        EXPORTING
          i_log_handle = mv_handle
          i_s_msg      = ls_msg
        EXCEPTIONS
          OTHERS       = 1.
      IF sy-subrc <> 0.
*       Meldung geht verloren - bewusst kein Abbruch der Schnittstelle
        CONTINUE.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD has_errors.
    rv_error = xsdbool( mv_err_count > 0 ).
  ENDMETHOD.


  METHOD save.
    DATA lt_handle TYPE bal_t_logh.

    INSERT mv_handle INTO TABLE lt_handle.
    CALL FUNCTION 'BAL_DB_SAVE'
      EXPORTING
        i_t_log_handle = lt_handle
      EXCEPTIONS
        OTHERS         = 1.
    IF sy-subrc <> 0.
      MESSAGE 'Anwendungsprotokoll konnte nicht gesichert werden' TYPE 'S' DISPLAY LIKE 'W'.
      RETURN.
    ENDIF.
    IF iv_commit = abap_true.
      COMMIT WORK.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
