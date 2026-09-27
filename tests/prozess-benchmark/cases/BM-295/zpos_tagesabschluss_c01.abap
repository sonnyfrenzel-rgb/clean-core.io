*&---------------------------------------------------------------------*
*&  Include           ZPOS_TAGESABSCHLUSS_C01
*&---------------------------------------------------------------------*
*  Grid-Behandler Bonjournal: Drucktaste "Bon anzeigen"
*----------------------------------------------------------------------*
CLASS lcl_journal_handler DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS on_toolbar
      FOR EVENT toolbar OF cl_gui_alv_grid
      IMPORTING e_object.
    METHODS on_user_command
      FOR EVENT user_command OF cl_gui_alv_grid
      IMPORTING e_ucomm.
ENDCLASS.

CLASS lcl_journal_handler IMPLEMENTATION.

  METHOD on_toolbar.
    APPEND VALUE #( function  = 'BON'
                    icon      = icon_display
                    quickinfo = 'Bon anzeigen'(b01) ) TO e_object->mt_toolbar.
  ENDMETHOD.

  METHOD on_user_command.
    DATA lt_rows TYPE lvc_t_row.

    CASE e_ucomm.
      WHEN 'BON'.
        go_grid->get_selected_rows( IMPORTING et_index_rows = lt_rows ).
*       ohne Markierung laeuft der Baustein leer (bekannt, Ticket 7710)
        READ TABLE lt_rows INTO DATA(ls_row) INDEX 1.
        READ TABLE gt_journal INTO DATA(ls_bon) INDEX ls_row-index.
        CALL FUNCTION 'Z_POS_BON_ANZEIGEN'
          EXPORTING
            iv_kasse = ls_bon-kasse
            iv_vbeln = ls_bon-vbeln.
    ENDCASE.
  ENDMETHOD.

ENDCLASS.
