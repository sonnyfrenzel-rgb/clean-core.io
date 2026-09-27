*&---------------------------------------------------------------------*
*&  Include  ZEWM_ERRQ_MON_CLS
*&---------------------------------------------------------------------*
CLASS lcl_monitor DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS run.
  PRIVATE SECTION.
    DATA: mt_errq TYPE STANDARD TABLE OF zewm_errq,
          mo_alv  TYPE REF TO cl_salv_table.
    METHODS select_entries.
    METHODS reprocess.
    METHODS discard.
    METHODS on_user_command FOR EVENT added_function OF cl_salv_events
      IMPORTING e_salv_function.
    METHODS on_double_click FOR EVENT double_click OF cl_salv_events_table
      IMPORTING row column.
ENDCLASS.

CLASS lcl_monitor IMPLEMENTATION.

  METHOD run.
    select_entries( ).
    IF mt_errq IS INITIAL.
      MESSAGE s061(zewm).
      RETURN.
    ENDIF.
    TRY.
        cl_salv_table=>factory( IMPORTING r_salv_table = mo_alv
                                CHANGING  t_table      = mt_errq ).
      CATCH cx_salv_msg.
        RETURN.
    ENDTRY.
    mo_alv->set_screen_status( pfstatus = 'ZSALV_ERRQ'
                               report   = sy-repid
                               set_functions = cl_salv_table=>c_functions_all ).
    mo_alv->get_selections( )->set_selection_mode( if_salv_c_selection_mode=>row_column ).
    SET HANDLER on_user_command FOR mo_alv->get_event( ).
    SET HANDLER on_double_click FOR mo_alv->get_event( ).
    mo_alv->display( ).
  ENDMETHOD.


  METHOD select_entries.
    IF p_all = abap_true.
      SELECT * FROM zewm_errq INTO TABLE mt_errq
        WHERE lgnum  IN s_lgnum
          AND ifcode IN s_ifc
          AND erdat  IN s_date.
    ELSE.
      SELECT * FROM zewm_errq INTO TABLE mt_errq
        WHERE lgnum  IN s_lgnum
          AND ifcode IN s_ifc
          AND erdat  IN s_date
          AND status = 'E'.
    ENDIF.
    SORT mt_errq BY erdat DESCENDING erzet DESCENDING.
  ENDMETHOD.


  METHOD on_user_command.
    CASE e_salv_function.
      WHEN 'REPROC'.
        reprocess( ).
      WHEN 'DISCARD'.
        discard( ).
      WHEN OTHERS.
        RETURN.
    ENDCASE.
    select_entries( ).
    mo_alv->refresh( ).
  ENDMETHOD.


  METHOD on_double_click.
    READ TABLE mt_errq INTO DATA(ls_errq) INDEX row.
    IF sy-subrc = 0.
      MESSAGE ls_errq-errtext TYPE 'I'.
    ENDIF.
  ENDMETHOD.


  METHOD reprocess.
    DATA: lt_rows TYPE salv_t_row,
          lv_ok   TYPE i,
          lv_err  TYPE i.

    lt_rows = mo_alv->get_selections( )->get_selected_rows( ).
    IF lt_rows IS INITIAL.
      MESSAGE 'Bitte Zeilen markieren' TYPE 'S' DISPLAY LIKE 'E'.
      RETURN.
    ENDIF.

    AUTHORITY-CHECK OBJECT 'Z_EWM_MON'
      ID 'ACTVT' FIELD '16'
      ID 'LGNUM' FIELD s_lgnum-low.
    IF sy-subrc <> 0.
      MESSAGE 'Keine Berechtigung zur Nachverarbeitung' TYPE 'S' DISPLAY LIKE 'E'.
      RETURN.
    ENDIF.

    LOOP AT lt_rows INTO DATA(lv_row).
      READ TABLE mt_errq ASSIGNING FIELD-SYMBOL(<ls_errq>) INDEX lv_row.
      CHECK <ls_errq>-status = 'E'.

      CALL FUNCTION 'ENQUEUE_EZEWM_ERRQ'
        EXPORTING
          guid           = <ls_errq>-guid
        EXCEPTIONS
          foreign_lock   = 1
          system_failure = 2
          OTHERS         = 3.
      IF sy-subrc <> 0.
        lv_err = lv_err + 1.
        CONTINUE.
      ENDIF.

*     Nachverarbeitungsbaustein je Schnittstelle aus der Queue (ZEWM_IF_CUST-HANDLER)
      CALL FUNCTION <ls_errq>-handler
        EXPORTING
          iv_guid = <ls_errq>-guid
        EXCEPTIONS
          failed  = 1
          OTHERS  = 2.
      IF sy-subrc = 0.
        UPDATE zewm_errq SET status = 'P'
                             aenam  = sy-uname
                             aedat  = sy-datum
          WHERE guid = <ls_errq>-guid.
        lv_ok = lv_ok + 1.
      ELSE.
        UPDATE zewm_errq SET retries = retries + 1
                             aenam   = sy-uname
                             aedat   = sy-datum
          WHERE guid = <ls_errq>-guid.
        lv_err = lv_err + 1.
      ENDIF.

      CALL FUNCTION 'DEQUEUE_EZEWM_ERRQ'
        EXPORTING
          guid = <ls_errq>-guid.
    ENDLOOP.

    COMMIT WORK.
    MESSAGE s062(zewm) WITH lv_ok lv_err.
  ENDMETHOD.


  METHOD discard.
    DATA: lt_rows   TYPE salv_t_row,
          lv_answer TYPE c LENGTH 1.

    lt_rows = mo_alv->get_selections( )->get_selected_rows( ).
    CHECK lt_rows IS NOT INITIAL.

    CALL FUNCTION 'POPUP_TO_CONFIRM'
      EXPORTING
        titlebar      = 'Fehlereintraege verwerfen'
        text_question = 'Markierte Eintraege endgueltig verwerfen?'
      IMPORTING
        answer        = lv_answer.
    IF lv_answer <> '1'.
      RETURN.
    ENDIF.

    LOOP AT lt_rows INTO DATA(lv_row).
      READ TABLE mt_errq INTO DATA(ls_errq) INDEX lv_row.
*     logisch loeschen, Revision will die Historie
      UPDATE zewm_errq SET status = 'D'
                           aenam  = sy-uname
                           aedat  = sy-datum
        WHERE guid = ls_errq-guid.
    ENDLOOP.
    COMMIT WORK.
  ENDMETHOD.

ENDCLASS.
