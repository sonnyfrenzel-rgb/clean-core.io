*&---------------------------------------------------------------------*
*&  Include           ZHR_ABRECHNUNG_VERGLEICH_CLS
*&---------------------------------------------------------------------*
CLASS lcl_vergleich DEFINITION.
  PUBLIC SECTION.
    EVENTS abweichung
      EXPORTING VALUE(ev_pernr) TYPE persno
                VALUE(ev_lgart) TYPE lgart
                VALUE(ev_alt)   TYPE maxbt
                VALUE(ev_neu)   TYPE maxbt.
    METHODS:
      constructor
        IMPORTING iv_schwelle TYPE p,
      vergleichen
        IMPORTING iv_pernr  TYPE persno
                  it_rt_akt TYPE hrpay99_rt
                  it_rt_vor TYPE hrpay99_rt.
  PRIVATE SECTION.
    DATA mv_schwelle TYPE p LENGTH 5 DECIMALS 1.
ENDCLASS.

CLASS lcl_protokoll DEFINITION.
  PUBLIC SECTION.
    METHODS:
      on_abweichung FOR EVENT abweichung OF lcl_vergleich
        IMPORTING ev_pernr ev_lgart ev_alt ev_neu,
      anzeigen.
  PRIVATE SECTION.
    DATA mt_out TYPE STANDARD TABLE OF ty_out.
ENDCLASS.

*----------------------------------------------------------------------*
CLASS lcl_vergleich IMPLEMENTATION.

  METHOD constructor.
    mv_schwelle = iv_schwelle.
  ENDMETHOD.

  METHOD vergleichen.
    DATA: ls_rt   TYPE pc207,
          lv_alt  TYPE maxbt,
          lv_proz TYPE p LENGTH 8 DECIMALS 1.

    LOOP AT it_rt_akt INTO ls_rt WHERE lgart IN s_lgart.
      lv_alt = VALUE #( it_rt_vor[ lgart = ls_rt-lgart ]-betrg OPTIONAL ).
*     neue Lohnart ohne Vorperiode -> 100 %
      lv_proz = COND #( WHEN lv_alt = 0 THEN 100
                        ELSE ( ls_rt-betrg - lv_alt ) * 100 / lv_alt ).
      IF abs( lv_proz ) > mv_schwelle.
        RAISE EVENT abweichung
          EXPORTING
            ev_pernr = iv_pernr
            ev_lgart = ls_rt-lgart
            ev_alt   = lv_alt
            ev_neu   = ls_rt-betrg.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.

*----------------------------------------------------------------------*
CLASS lcl_protokoll IMPLEMENTATION.

  METHOD on_abweichung.
    APPEND VALUE #( pernr = ev_pernr lgart = ev_lgart
                    alt   = ev_alt   neu   = ev_neu ) TO mt_out.
  ENDMETHOD.

  METHOD anzeigen.
    DATA ls_out TYPE ty_out.
    LOOP AT mt_out INTO ls_out.
      WRITE: / ls_out-pernr, ls_out-lgart, ls_out-alt, ls_out-neu.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
