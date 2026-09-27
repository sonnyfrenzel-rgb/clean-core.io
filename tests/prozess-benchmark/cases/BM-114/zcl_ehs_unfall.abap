CLASS zcl_ehs_unfall DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Arbeitsunfall: Erfassung, Meldepflicht nach § 193 SGB VII,
* Vormerkung der Unfallanzeige an die Berufsgenossenschaft
*----------------------------------------------------------------------*
* 2021-03 LMA  Erstellung
* 2022-01 LMA  Status T (tödlich) / M (meldepflichtig) / E (erfasst)
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    EVENTS gemeldet
      EXPORTING
        VALUE(ev_unfallnr)       TYPE zehs_unfallnr
        VALUE(ev_meldepflichtig) TYPE abap_bool.

    METHODS constructor
      IMPORTING
        is_unfall TYPE zehs_s_unfall
      RAISING
        zcx_ehs_unfall.
    METHODS erfassen
      RETURNING
        VALUE(rv_unfallnr) TYPE zehs_unfallnr
      RAISING
        zcx_ehs_unfall.

  PRIVATE SECTION.
    DATA: ms_unfall   TYPE zehs_s_unfall,
          mv_unfallnr TYPE zehs_unfallnr.

    METHODS ist_meldepflichtig
      RETURNING
        VALUE(rv_pflicht) TYPE abap_bool.
    METHODS bg_anzeige_vormerken
      RAISING
        zcx_ehs_unfall.
ENDCLASS.


CLASS zcl_ehs_unfall IMPLEMENTATION.

  METHOD constructor.
    ms_unfall = is_unfall.
    IF ms_unfall-pernr IS INITIAL OR ms_unfall-datum IS INITIAL.
      RAISE EXCEPTION TYPE zcx_ehs_unfall
        EXPORTING
          textid = zcx_ehs_unfall=>pflichtfeld.
    ENDIF.

*   Mitarbeiter muss am Unfalltag aktiv beschäftigt sein
    SELECT SINGLE @abap_true FROM pa0000
      WHERE pernr = @ms_unfall-pernr
        AND begda <= @ms_unfall-datum
        AND endda >= @ms_unfall-datum
        AND stat2 = '3'
      INTO @DATA(lv_aktiv).
    IF lv_aktiv = abap_false.
      RAISE EXCEPTION TYPE zcx_ehs_unfall
        EXPORTING
          textid = zcx_ehs_unfall=>nicht_beschaeftigt
          pernr  = ms_unfall-pernr.
    ENDIF.
  ENDMETHOD.


  METHOD erfassen.
    DATA ls_hdr TYPE zehs_unfall.

    CALL FUNCTION 'NUMBER_GET_NEXT'
      EXPORTING
        nr_range_nr = '01'
        object      = 'ZEHS_UNF'
      IMPORTING
        number      = rv_unfallnr
      EXCEPTIONS
        OTHERS      = 1.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_ehs_unfall
        EXPORTING
          textid = zcx_ehs_unfall=>nummernkreis.
    ENDIF.
    mv_unfallnr = rv_unfallnr.

    ls_hdr = CORRESPONDING #( ms_unfall ).
    ls_hdr-unfallnr = rv_unfallnr.
    ls_hdr-status   = COND #( WHEN ms_unfall-toedlich = abap_true THEN 'T'
                              WHEN ms_unfall-ausfalltage > 3       THEN 'M'
                              ELSE 'E' ).
    ls_hdr-erfdat   = sy-datum.
    ls_hdr-erfnam   = sy-uname.
    INSERT zehs_unfall FROM ls_hdr.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_ehs_unfall
        EXPORTING
          textid = zcx_ehs_unfall=>db_fehler.
    ENDIF.

    DATA(lv_pflicht) = ist_meldepflichtig( ).
    IF lv_pflicht = abap_true.
      bg_anzeige_vormerken( ).
    ENDIF.

    RAISE EVENT gemeldet
      EXPORTING
        ev_unfallnr       = rv_unfallnr
        ev_meldepflichtig = lv_pflicht.
  ENDMETHOD.


  METHOD ist_meldepflichtig.
*   § 193 SGB VII: Tod oder Arbeitsunfähigkeit von mehr als drei Tagen
    rv_pflicht = xsdbool( ms_unfall-toedlich = abap_true
                          OR ms_unfall-ausfalltage > 3 ).
  ENDMETHOD.


  METHOD bg_anzeige_vormerken.
    DATA ls_bg TYPE zehs_bg_anz.

    SELECT SINGLE bg_mitglnr FROM zehs_bg_werk
      WHERE werks = @ms_unfall-werks
      INTO @ls_bg-mitglnr.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_ehs_unfall
        EXPORTING
          textid = zcx_ehs_unfall=>bg_fehlt
          werks  = ms_unfall-werks.
    ENDIF.

    ls_bg-unfallnr = mv_unfallnr.
    ls_bg-frist    = ms_unfall-datum + 3.
    ls_bg-status   = 'OFFEN'.
    INSERT zehs_bg_anz FROM ls_bg.
  ENDMETHOD.

ENDCLASS.
