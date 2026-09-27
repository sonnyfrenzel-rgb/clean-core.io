CLASS zcl_co_plan_pruefer DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF ty_zeile,
             zeilennr TYPE i,
             kostl    TYPE kostl,
             kstar    TYPE kstar,
             perio    TYPE i,
             wert     TYPE bapicurr_d,
             waers    TYPE waers,
           END OF ty_zeile.

    METHODS constructor
      IMPORTING iv_kokrs TYPE kokrs
                iv_gjahr TYPE gjahr
                iv_versn TYPE versn
      RAISING   zcx_co_plan.

    METHODS pruefe_zeile
      IMPORTING is_zeile TYPE ty_zeile
      RAISING   zcx_co_plan.

  PRIVATE SECTION.
    DATA: mv_kokrs    TYPE kokrs,
          mv_gjahr    TYPE gjahr,
          mv_versn    TYPE versn,
          mv_stichtag TYPE datum,
          mt_kostl_ok TYPE HASHED TABLE OF kostl WITH UNIQUE KEY table_line.

    METHODS kostl_gueltig
      IMPORTING iv_kostl     TYPE kostl
      RETURNING VALUE(rv_ok) TYPE abap_bool.
ENDCLASS.



CLASS zcl_co_plan_pruefer IMPLEMENTATION.

  METHOD constructor.
    SELECT SINGLE versn FROM tka09 INTO mv_versn
      WHERE kokrs = iv_kokrs
        AND versn = iv_versn.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_co_plan
        EXPORTING
          textid = zcx_co_plan=>version_unbekannt
          mv_v1  = iv_versn.
    ENDIF.

    mv_kokrs = iv_kokrs.
    mv_gjahr = iv_gjahr.
*   Gueltigkeit zum Jahresende des Planjahres
    CONCATENATE iv_gjahr '1231' INTO mv_stichtag.
  ENDMETHOD.


  METHOD pruefe_zeile.
    DATA lv_katyp TYPE katyp.

    IF is_zeile-perio < 1 OR is_zeile-perio > 12.
      RAISE EXCEPTION TYPE zcx_co_plan
        EXPORTING
          textid = zcx_co_plan=>periode_ungueltig
          mv_v1  = is_zeile-perio.
    ENDIF.

    IF kostl_gueltig( is_zeile-kostl ) = abap_false.
      RAISE EXCEPTION TYPE zcx_co_plan
        EXPORTING
          textid = zcx_co_plan=>kostl_ungueltig
          mv_v1  = is_zeile-kostl.
    ENDIF.

*   Kostenart (CSKB) - nach S/4 eigentlich Sachkonto mit Kostenartentyp
    SELECT SINGLE katyp FROM cskb INTO lv_katyp
      WHERE kokrs  = mv_kokrs
        AND kstar  = is_zeile-kstar
        AND datbi >= mv_stichtag
        AND datab <= mv_stichtag.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_co_plan
        EXPORTING
          textid = zcx_co_plan=>kstar_ungueltig
          mv_v1  = is_zeile-kstar.
    ENDIF.
    IF lv_katyp <> '01'.
      RAISE EXCEPTION TYPE zcx_co_plan
        EXPORTING
          textid = zcx_co_plan=>kstar_nicht_primaer
          mv_v1  = is_zeile-kstar.
    ENDIF.
  ENDMETHOD.


  METHOD kostl_gueltig.
    READ TABLE mt_kostl_ok TRANSPORTING NO FIELDS
      WITH TABLE KEY table_line = iv_kostl.
    IF sy-subrc = 0.
      rv_ok = abap_true.
      RETURN.
    ENDIF.

    SELECT SINGLE @abap_true FROM csks
      WHERE kokrs  = @mv_kokrs
        AND kostl  = @iv_kostl
        AND datbi >= @mv_stichtag
        AND datab <= @mv_stichtag
      INTO @rv_ok.
    IF rv_ok = abap_true.
      INSERT iv_kostl INTO TABLE mt_kostl_ok.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
