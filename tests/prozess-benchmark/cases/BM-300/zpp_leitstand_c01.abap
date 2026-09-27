*&---------------------------------------------------------------------*
*&  Include           ZPP_LEITSTAND_C01
*&---------------------------------------------------------------------*
*  Oberflaeche: Doppelklick oben filtert unten, Toolbar/Kommando unten
*----------------------------------------------------------------------*
CLASS lcl_ui DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS on_double_click_ap
      FOR EVENT double_click OF cl_gui_alv_grid
      IMPORTING e_row.
    METHODS on_toolbar_vg
      FOR EVENT toolbar OF cl_gui_alv_grid
      IMPORTING e_object.
    METHODS on_user_command_vg
      FOR EVENT user_command OF cl_gui_alv_grid
      IMPORTING e_ucomm.
ENDCLASS.

CLASS lcl_ui IMPLEMENTATION.

  METHOD on_double_click_ap.
    DATA(lv_objid) = gt_arbpl[ e_row-index ]-objid.
    gt_anzeige = VALUE #( FOR ls_v IN gt_vorg WHERE ( arbid = lv_objid ) ( ls_v ) ).
    SORT gt_anzeige BY fsavd aufnr vornr.
    go_grid_vg->refresh_table_display( ).
  ENDMETHOD.

  METHOD on_toolbar_vg.
    APPEND VALUE #( butn_type = 3 ) TO e_object->mt_toolbar.
    APPEND VALUE #( function = 'VORZ'  icon = icon_previous_value
                    quickinfo = '1 Tag vorziehen'(b01) ) TO e_object->mt_toolbar.
    APPEND VALUE #( function = 'FREI'  icon = icon_release
                    quickinfo = 'Auftrag freigeben'(b02) ) TO e_object->mt_toolbar.
    APPEND VALUE #( function = 'DRUCK' icon = icon_print
                    quickinfo = 'Arbeitspapiere'(b03) ) TO e_object->mt_toolbar.
  ENDMETHOD.

  METHOD on_user_command_vg.
    DATA: lt_rows TYPE lvc_t_row,
          lo_akt  TYPE REF TO lcl_aktion,
          lx_leit TYPE REF TO lcx_leit.

    go_grid_vg->get_selected_rows( IMPORTING et_index_rows = lt_rows ).
    IF lt_rows IS INITIAL.
      MESSAGE s820(zpp_ls) DISPLAY LIKE 'W'.          "Vorgang markieren
      RETURN.
    ENDIF.

*   nur die erste markierte Zeile - Mehrfachauswahl war nie gewuenscht
    DATA(ls_vorg) = gt_anzeige[ lt_rows[ 1 ]-index ].
    TRY.
        lo_akt = lcl_aktion=>fuer( e_ucomm ).
        lo_akt->ausfuehren( ls_vorg ).
        MESSAGE s821(zpp_ls) WITH ls_vorg-aufnr e_ucomm.
      CATCH lcx_leit INTO lx_leit.
        MESSAGE lx_leit TYPE 'S' DISPLAY LIKE 'E'.
    ENDTRY.
    go_grid_vg->refresh_table_display( ).
  ENDMETHOD.

ENDCLASS.
