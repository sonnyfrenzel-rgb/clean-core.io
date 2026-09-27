CLASS zcl_co_kalk_regel_abw DEFINITION
  PUBLIC
  INHERITING FROM zcl_co_kalk_regel
  FINAL
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* Zusaetzlich zur Basisregel: neuer Preis darf hoechstens MV_PROZ
* Prozent vom aktuellen Standardpreis abweichen. Ohne Standardpreis
* (Neuteil) keine Abweichungspruefung.
*
* Hinweis 2019 (Revision): Die Schwelle gilt symmetrisch fuer Preis-
* erhoehung und -senkung. Eine getrennte Schwelle fuer Senkungen war
* angefragt (Ticket 7731), wurde aber nicht umgesetzt.
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    METHODS pruefen REDEFINITION.
ENDCLASS.



CLASS zcl_co_kalk_regel_abw IMPLEMENTATION.

  METHOD pruefen.
    DATA: lv_stprs TYPE stprs,
          lv_peinh TYPE peinh,
          lv_alt   TYPE ck_kwt,
          lv_neu   TYPE ck_kwt,
          lv_proz  TYPE p LENGTH 8 DECIMALS 2.

    super->pruefen( is_keko ).

    SELECT SINGLE stprs, peinh FROM mbew
      WHERE matnr = @is_keko-matnr
        AND bwkey = @is_keko-werks
        AND bwtar = @space
      INTO (@lv_stprs, @lv_peinh).
    IF sy-subrc <> 0 OR lv_stprs IS INITIAL.
      RETURN.
    ENDIF.

    lv_alt = lv_stprs / lv_peinh.
    lv_neu = kalk_preis( is_keko ).
    lv_proz = abs( lv_neu - lv_alt ) * 100 / lv_alt.

    IF lv_proz > mv_proz.
      RAISE EXCEPTION TYPE zcx_co_kalk
        EXPORTING
          mv_schwere = 'W'
          mv_text    = |Abweichung { lv_proz } % zum Standardpreis|.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
