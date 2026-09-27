CLASS zcl_mm_we_assist DEFINITION
  PUBLIC
  INHERITING FROM cl_wd_component_assistance
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS pruefe_bestellung
      IMPORTING iv_ebeln TYPE ebeln
      RAISING   zcx_mm_we.
    METHODS bereits_geliefert
      IMPORTING iv_ebeln        TYPE ebeln
                iv_ebelp        TYPE ebelp
      RETURNING VALUE(rv_menge) TYPE bstmg.
ENDCLASS.



CLASS zcl_mm_we_assist IMPLEMENTATION.

  METHOD pruefe_bestellung.
    SELECT SINGLE ebeln, bsart, loekz, frgke
      FROM ekko
      WHERE ebeln = @iv_ebeln
      INTO @DATA(ls_ekko).
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_mm_we
        EXPORTING textid = zcx_mm_we=>bestellung_unbekannt ebeln = iv_ebeln.
    ENDIF.

    IF ls_ekko-loekz IS NOT INITIAL.
      RAISE EXCEPTION TYPE zcx_mm_we
        EXPORTING textid = zcx_mm_we=>bestellung_geloescht ebeln = iv_ebeln.
    ENDIF.

*   Freigabekennzeichen: B = gesperrt (Freigabe offen)
    IF ls_ekko-frgke = 'B'.
      RAISE EXCEPTION TYPE zcx_mm_we
        EXPORTING textid = zcx_mm_we=>nicht_freigegeben ebeln = iv_ebeln.
    ENDIF.

*    IF ls_ekko-bsart = 'ZUB'.   "Umlagerung ueber eigene App, 2019 entfernt
*      RAISE EXCEPTION ...
*    ENDIF.
  ENDMETHOD.


  METHOD bereits_geliefert.
*   WE (101) minus Storno (102) aus den Materialbelegen
    DATA: lv_we    TYPE bstmg,
          lv_storn TYPE bstmg.

    SELECT SUM( menge ) FROM mseg
      WHERE ebeln = @iv_ebeln
        AND ebelp = @iv_ebelp
        AND bwart = '101'
      INTO @lv_we.

    SELECT SUM( menge ) FROM mseg
      WHERE ebeln = @iv_ebeln
        AND ebelp = @iv_ebelp
        AND bwart = '102'
      INTO @lv_storn.

    rv_menge = lv_we - lv_storn.
  ENDMETHOD.

ENDCLASS.
