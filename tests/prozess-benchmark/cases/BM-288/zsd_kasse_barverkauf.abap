*&---------------------------------------------------------------------*
*& Report  ZSD_KASSE_BARVERKAUF
*&---------------------------------------------------------------------*
*& Barverkauf am Verkaufsschalter mit editierbarem Grid
*& Dynpro 0100: Custom Control CC_KASSE, Status KASSE (BUCHEN, BACK, EXIT)
*&---------------------------------------------------------------------*
*& 2014-03-10 ABE  Ersterstellung (Ersatz Kassenbuch-Excel)
*& 2016-09-01 ABE  Preis aus PR00 im Grid (DATA_CHANGED)
*& 2021-11-22 EXT  Kassenjournal ZPOS_JOURNAL
*&---------------------------------------------------------------------*
REPORT zsd_kasse_barverkauf.

INCLUDE zsd_kasse_barverkauf_top.
INCLUDE zsd_kasse_barverkauf_c01.

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*
  go_kasse = NEW lcl_kasse( ).
  CALL SCREEN 0100.

*&---------------------------------------------------------------------*
*&      Module  STATUS_0100  OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'KASSE'.
  SET TITLEBAR 'KASSE' WITH p_vkbur p_kasse.

  IF go_grid IS INITIAL.
    CREATE OBJECT go_container
      EXPORTING
        container_name = 'CC_KASSE'.
    CREATE OBJECT go_grid
      EXPORTING
        i_parent = go_container.

    go_grid->register_edit_event(
      i_event_id = cl_gui_alv_grid=>mc_evt_modified ).
    SET HANDLER go_kasse->on_data_changed FOR go_grid.

    go_grid->set_table_for_first_display(
      EXPORTING
        i_structure_name = 'ZPOS_S_KASSE_POS'
      CHANGING
        it_outtab        = go_kasse->mt_pos ).
  ENDIF.
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.

  go_grid->check_changed_data( ).

  CASE ok_code.
    WHEN 'BUCHEN'.
      go_kasse->buchen( ).

    WHEN 'BACK' OR 'EXIT'.
      IF go_kasse->has_open_items( ) = abap_true.
        CALL FUNCTION 'POPUP_TO_CONFIRM'
          EXPORTING
            text_question         = 'Offene Positionen verwerfen?'(q01)
            default_button        = '2'
            display_cancel_button = abap_false
          IMPORTING
            answer                = gv_answer.
        IF gv_answer <> '1'.
          CLEAR ok_code.
          RETURN.
        ENDIF.
      ENDIF.
      LEAVE TO SCREEN 0.
  ENDCASE.

  CLEAR ok_code.
ENDMODULE.
