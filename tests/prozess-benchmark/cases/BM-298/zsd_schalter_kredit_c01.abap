*&---------------------------------------------------------------------*
*&  Include           ZSD_SCHALTER_KREDIT_C01
*&---------------------------------------------------------------------*
*  Kreditdaten des Kunden, Grid-Behandler, Freigabeprotokoll
*----------------------------------------------------------------------*

CLASS lcx_frei DEFINITION INHERITING FROM cx_static_check FINAL.
  PUBLIC SECTION.
    INTERFACES if_t100_dyn_msg.
ENDCLASS.
CLASS lcx_frei IMPLEMENTATION.
ENDCLASS.

*----------------------------------------------------------------------*
* Kreditlimit und Obligo (klassisches SD-Kreditmanagement)
*----------------------------------------------------------------------*
CLASS lcl_kredit DEFINITION FINAL CREATE PRIVATE.
  PUBLIC SECTION.
    CLASS-METHODS fuer_kunde
      IMPORTING iv_kunnr        TYPE kunnr
                iv_kkber        TYPE kkber
      RETURNING VALUE(ro_kred)  TYPE REF TO lcl_kredit.
    METHODS ueberschreitung
      IMPORTING iv_netwr        TYPE netwr_ak
      RETURNING VALUE(rv_betrag) TYPE netwr_ak.
  PRIVATE SECTION.
    DATA: mv_limit  TYPE klimk,
          mv_obligo TYPE netwr_ak.
ENDCLASS.

CLASS lcl_kredit IMPLEMENTATION.

  METHOD fuer_kunde.
    DATA: lv_skfor TYPE skfor,
          lv_ssobl TYPE ssobl,
          lv_oeikw TYPE oeikw.

    ro_kred = NEW #( ).
    SELECT SINGLE klimk skfor ssobl FROM knkk
      INTO (ro_kred->mv_limit, lv_skfor, lv_ssobl)
      WHERE kunnr = iv_kunnr
        AND kkber = iv_kkber.
*   offene Auftragswerte aus Kredit-Infostruktur
    SELECT SUM( oeikw ) FROM s066 INTO lv_oeikw
      WHERE knkli = iv_kunnr
        AND kkber = iv_kkber.
    ro_kred->mv_obligo = lv_skfor + lv_ssobl + lv_oeikw.
  ENDMETHOD.

* Betrag, um den der Auftrag das Limit ueberzieht. Der Auftrag steckt
* schon im Obligo (S066) - trotzdem addiert, Kreditabteilung will Puffer.
  METHOD ueberschreitung.
    rv_betrag = mv_obligo + iv_netwr - mv_limit.
    IF rv_betrag < 0.
      rv_betrag = 0.
    ENDIF.
  ENDMETHOD.

ENDCLASS.

*----------------------------------------------------------------------*
* Doppelklick: Auftrag anzeigen
*----------------------------------------------------------------------*
CLASS lcl_grid_hdl DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS on_double_click
      FOR EVENT double_click OF cl_gui_alv_grid
      IMPORTING e_row.
ENDCLASS.

CLASS lcl_grid_hdl IMPLEMENTATION.
  METHOD on_double_click.
    READ TABLE gt_auftr INTO DATA(ls_a) INDEX e_row-index.
    CHECK sy-subrc = 0.
    SET PARAMETER ID 'AUN' FIELD ls_a-vbeln.
    CALL TRANSACTION 'VA03' AND SKIP FIRST SCREEN.
  ENDMETHOD.
ENDCLASS.
