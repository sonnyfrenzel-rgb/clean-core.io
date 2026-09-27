CLASS zcl_sd_price_base DEFINITION
  PUBLIC
  ABSTRACT
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS calculate FINAL
      IMPORTING is_komk       TYPE komk
                is_komp       TYPE komp
      RETURNING VALUE(rv_net) TYPE kbetr
      RAISING   zcx_sd_pricing.

  PROTECTED SECTION.
    DATA mv_base TYPE kbetr.

    METHODS get_base_price
      IMPORTING is_komk        TYPE komk
                is_komp        TYPE komp
      RETURNING VALUE(rv_base) TYPE kbetr
      RAISING   zcx_sd_pricing.
    METHODS apply_discount ABSTRACT
      IMPORTING iv_base       TYPE kbetr
                is_komk       TYPE komk
                is_komp       TYPE komp
      RETURNING VALUE(rv_net) TYPE kbetr.
    METHODS check_min_margin
      IMPORTING iv_net  TYPE kbetr
                is_komp TYPE komp
      RAISING   zcx_sd_pricing.
ENDCLASS.



CLASS zcl_sd_price_base IMPLEMENTATION.

  METHOD calculate.
*   Schablone: Basispreis -> Rabatt (je Strategie) -> Margenpruefung
    mv_base = get_base_price( is_komk = is_komk
                              is_komp = is_komp ).
    rv_net = apply_discount( iv_base = mv_base
                             is_komk = is_komk
                             is_komp = is_komp ).
    check_min_margin( iv_net  = rv_net
                      is_komp = is_komp ).
  ENDMETHOD.


  METHOD get_base_price.
*   1. kundenindividueller Preis (A305: VkOrg/VtWeg/Kunde/Material)
    SELECT SINGLE p~kbetr FROM a305 AS a
      INNER JOIN konp AS p ON p~knumh = a~knumh
      INTO rv_base
      WHERE a~kappl = 'V'
        AND a~kschl = 'ZPR0'
        AND a~vkorg = is_komk-vkorg
        AND a~vtweg = is_komk-vtweg
        AND a~kunnr = is_komk-kunnr
        AND a~matnr = is_komp-matnr
        AND a~datab <= is_komk-prsdt
        AND a~datbi >= is_komk-prsdt.
    IF sy-subrc <> 0.
*     2. Materialpreis (A004)
      SELECT SINGLE p~kbetr FROM a004 AS a
        INNER JOIN konp AS p ON p~knumh = a~knumh
        INTO rv_base
        WHERE a~kappl = 'V'
          AND a~kschl = 'ZPR0'
          AND a~vkorg = is_komk-vkorg
          AND a~vtweg = is_komk-vtweg
          AND a~matnr = is_komp-matnr
          AND a~datab <= is_komk-prsdt
          AND a~datbi >= is_komk-prsdt.
      IF sy-subrc <> 0.
        RAISE EXCEPTION TYPE zcx_sd_pricing
          EXPORTING
            textid = zcx_sd_pricing=>no_base_price
            matnr  = is_komp-matnr.
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD check_min_margin.
*   Mindestmarge 5 % auf Standardpreis
    SELECT SINGLE stprs, peinh FROM mbew
      WHERE matnr = @is_komp-matnr
        AND bwkey = @is_komp-werks
        AND bwtar = @space
      INTO @DATA(ls_mbew).
    IF sy-subrc = 0 AND ls_mbew-peinh > 0
       AND iv_net < ls_mbew-stprs / ls_mbew-peinh * '1.05'.
      RAISE EXCEPTION TYPE zcx_sd_pricing
        EXPORTING
          textid = zcx_sd_pricing=>below_margin
          matnr  = is_komp-matnr.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
