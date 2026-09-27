*&---------------------------------------------------------------------*
*&  Include           SAPMZPM_RUECK_O01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Module  STATUS_0100  OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'S0100'.
  SET TITLEBAR 'T0100' WITH gv_aufnr_alt.
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  SUBSCREEN_0100  OUTPUT
*&---------------------------------------------------------------------*
MODULE subscreen_0100 OUTPUT.
  gv_dynnr = SWITCH #( ts_rueck-activetab WHEN 'TAB_KOMP' THEN '0120'
                                          ELSE '0110' ).
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  GRID_0120  OUTPUT
*&---------------------------------------------------------------------*
MODULE grid_0120 OUTPUT.
  IF go_grid IS INITIAL.
    CREATE OBJECT go_cont
      EXPORTING
        container_name = 'CC_KOMP'.
    CREATE OBJECT go_grid
      EXPORTING
        i_parent = go_cont.
    CREATE OBJECT go_handler.
    go_grid->register_edit_event(
      i_event_id = cl_gui_alv_grid=>mc_evt_modified ).
    SET HANDLER go_handler->on_data_changed FOR go_grid.
    go_grid->set_table_for_first_display(
      EXPORTING
        i_structure_name = 'ZPM_S_RUECK_KOMP'
      CHANGING
        it_outtab        = gt_komp ).
  ELSE.
    go_grid->refresh_table_display( ).
  ENDIF.
ENDMODULE.
