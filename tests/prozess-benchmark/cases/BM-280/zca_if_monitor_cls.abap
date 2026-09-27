*&---------------------------------------------------------------------*
*&  Include  ZCA_IF_MONITOR_CLS
*&---------------------------------------------------------------------*
CLASS lcl_monitor DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS run.
  PRIVATE SECTION.
    DATA: mt_log TYPE STANDARD TABLE OF zca_if_log,
          mo_alv TYPE REF TO cl_salv_table.
    METHODS select_entries.
    METHODS reprocess_selected.
    METHODS show_log.
    METHODS on_function FOR EVENT added_function OF cl_salv_events
      IMPORTING e_salv_function.
ENDCLASS.

CLASS lcl_monitor IMPLEMENTATION.

  METHOD run.
    select_entries( ).
    IF mt_log IS INITIAL.
      MESSAGE s500(zca).
      RETURN.
    ENDIF.

    TRY.
        cl_salv_table=>factory( IMPORTING r_salv_table = mo_alv
                                CHANGING  t_table      = mt_log ).
      CATCH cx_salv_msg INTO DATA(lx_salv).
        MESSAGE lx_salv TYPE 'E'.
    ENDTRY.
    mo_alv->set_screen_status( pfstatus      = 'ZIF_MON'
                               report        = sy-repid
                               set_functions = cl_salv_table=>c_functions_all ).
    mo_alv->get_selections( )->set_selection_mode( if_salv_c_selection_mode=>row_column ).
    SET HANDLER on_function FOR mo_alv->get_event( ).
    mo_alv->display( ).
  ENDMETHOD.


  METHOD select_entries.
    SELECT * FROM zca_if_log INTO TABLE mt_log
      WHERE ifcode     IN s_ifc
        AND module     IN s_mod
        AND created_on IN s_date.
    IF p_err = abap_true.
      DELETE mt_log WHERE status <> 'E'.
    ENDIF.

*   nur Module, die der Benutzer sehen darf
    LOOP AT mt_log INTO DATA(ls_log).
      AUTHORITY-CHECK OBJECT 'Z_IF_MON'
        ID 'ACTVT'  FIELD '03'
        ID 'MODULE' FIELD ls_log-module.
      IF sy-subrc <> 0.
        DELETE mt_log.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD on_function.
    CASE e_salv_function.
      WHEN 'REPROC'.
        reprocess_selected( ).
        select_entries( ).
        mo_alv->refresh( ).
      WHEN 'SHOWLOG'.
        show_log( ).
    ENDCASE.
  ENDMETHOD.


  METHOD reprocess_selected.
    DATA: lo_reproc TYPE REF TO zif_ca_reprocessor,
          ls_result TYPE zif_ca_reprocessor=>ty_result,
          lv_ok     TYPE i,
          lv_err    TYPE i,
          lv_skip   TYPE i.

    DATA(lt_rows) = mo_alv->get_selections( )->get_selected_rows( ).
    IF lt_rows IS INITIAL.
      MESSAGE s501(zca) DISPLAY LIKE 'E'.
      RETURN.
    ENDIF.

    LOOP AT lt_rows INTO DATA(lv_row).
      READ TABLE mt_log INTO DATA(ls_log) INDEX lv_row.
      IF ls_log-status <> 'E'.
        lv_skip = lv_skip + 1.
        CONTINUE.
      ENDIF.

      AUTHORITY-CHECK OBJECT 'Z_IF_MON'
        ID 'ACTVT'  FIELD '16'
        ID 'MODULE' FIELD ls_log-module.
      IF sy-subrc <> 0.
        lv_skip = lv_skip + 1.
        CONTINUE.
      ENDIF.

      CALL FUNCTION 'ENQUEUE_EZCA_IF_LOG'
        EXPORTING
          guid           = ls_log-guid
        EXCEPTIONS
          foreign_lock   = 1
          OTHERS         = 2.
      IF sy-subrc <> 0.
        lv_skip = lv_skip + 1.
        CONTINUE.
      ENDIF.

      TRY.
          lo_reproc = zcl_ca_reproc_factory=>get( ls_log-ifcode ).
          ls_result = lo_reproc->reprocess( ls_log ).
        CATCH zcx_ca_reproc INTO DATA(lx_reproc).
          ls_result-ok      = abap_false.
          ls_result-message = lx_reproc->get_text( ).
      ENDTRY.

      IF ls_result-ok = abap_true.
        UPDATE zca_if_log SET status     = 'P'
                              errtext    = ls_result-message
                              changed_by = sy-uname
          WHERE guid = ls_log-guid.
        lv_ok = lv_ok + 1.
      ELSE.
        UPDATE zca_if_log SET retries    = retries + 1
                              errtext    = ls_result-message
                              changed_by = sy-uname
          WHERE guid = ls_log-guid.
        lv_err = lv_err + 1.
      ENDIF.
      COMMIT WORK.

      CALL FUNCTION 'DEQUEUE_EZCA_IF_LOG'
        EXPORTING
          guid = ls_log-guid.
    ENDLOOP.

    MESSAGE s502(zca) WITH lv_ok lv_err lv_skip.
  ENDMETHOD.


  METHOD show_log.
    DATA: lt_lognum TYPE bal_t_logn,
          lt_handle TYPE bal_t_logh.

    DATA(lt_rows) = mo_alv->get_selections( )->get_selected_rows( ).
    CHECK lines( lt_rows ) = 1.
    READ TABLE mt_log INTO DATA(ls_log) INDEX lt_rows[ 1 ].
    IF ls_log-lognumber IS INITIAL.
      MESSAGE s503(zca).
      RETURN.
    ENDIF.

    INSERT ls_log-lognumber INTO TABLE lt_lognum.
    CALL FUNCTION 'BAL_DB_LOAD'
      EXPORTING
        i_t_lognumber      = lt_lognum
      IMPORTING
        e_t_log_handle     = lt_handle
      EXCEPTIONS
        OTHERS             = 1.
    IF sy-subrc = 0.
      CALL FUNCTION 'BAL_DSP_LOG_DISPLAY'
        EXPORTING
          i_t_log_handle = lt_handle
        EXCEPTIONS
          OTHERS         = 1.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
