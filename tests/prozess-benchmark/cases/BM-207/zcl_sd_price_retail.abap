CLASS zcl_sd_price_retail DEFINITION
  PUBLIC
  INHERITING FROM zcl_sd_price_base
  FINAL
  CREATE PUBLIC.

  PROTECTED SECTION.
    METHODS apply_discount REDEFINITION.
    METHODS check_min_margin REDEFINITION.

  PRIVATE SECTION.
    DATA mv_campaign TYPE abap_bool.
ENDCLASS.



CLASS zcl_sd_price_retail IMPLEMENTATION.

  METHOD apply_discount.
    rv_net = iv_base.
    mv_campaign = abap_false.
*   Aktionsrabatt je Material im Preisdatum
    SELECT SINGLE rabatt FROM zsd_campaign
      WHERE matnr = @is_komp-matnr
        AND datab <= @is_komk-prsdt
        AND datbi >= @is_komk-prsdt
      INTO @DATA(lv_rabatt).
    IF sy-subrc = 0.
      rv_net = iv_base * ( 100 - lv_rabatt ) / 100.
      mv_campaign = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD check_min_margin.
*   Aktionsware darf unter Mindestmarge verkauft werden (Marketing 2021)
    IF mv_campaign = abap_true.
      RETURN.
    ENDIF.
    super->check_min_margin( iv_net  = iv_net
                             is_komp = is_komp ).
  ENDMETHOD.

ENDCLASS.
