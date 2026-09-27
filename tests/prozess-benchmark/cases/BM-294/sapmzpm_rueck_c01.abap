*&---------------------------------------------------------------------*
*&  Include           SAPMZPM_RUECK_C01
*&---------------------------------------------------------------------*
*  Ereignisbehandler Komponentengrid (Dynpro 0120)
*----------------------------------------------------------------------*
CLASS lcl_komp_handler DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS on_data_changed
      FOR EVENT data_changed OF cl_gui_alv_grid
      IMPORTING er_data_changed.
ENDCLASS.

CLASS lcl_komp_handler IMPLEMENTATION.

*----------------------------------------------------------------------*
* Entnahmemenge gegen offene Reservierungsmenge pruefen
*----------------------------------------------------------------------*
  METHOD on_data_changed.
    DATA: ls_cell  TYPE lvc_s_modi,
          lv_menge TYPE erfmg,
          lv_offen TYPE bdmng.

    LOOP AT er_data_changed->mt_good_cells INTO ls_cell
         WHERE fieldname = 'MENGE_NEU'.
      DATA(ls_komp) = gt_komp[ ls_cell-row_id ].
      lv_menge = ls_cell-value.
      lv_offen = ls_komp-bdmng - ls_komp-enmng.
      IF lv_menge > lv_offen.
*       Mehrentnahme erlaubt (Verschleissteile), aber Hinweis im Protokoll
        er_data_changed->add_protocol_entry(
          i_msgid     = 'ZPM_RM'
          i_msgty     = 'W'
          i_msgno     = '041'
          i_msgv1     = ls_komp-matnr
          i_msgv2     = lv_offen
          i_fieldname = ls_cell-fieldname
          i_row_id    = ls_cell-row_id ).
      ENDIF.
      gv_changed = abap_true.
    ENDLOOP.
  ENDMETHOD.

* on_double_click (MMBE-Absprung) 2016 entfernt - Werkstatt hat kein MMBE

ENDCLASS.
