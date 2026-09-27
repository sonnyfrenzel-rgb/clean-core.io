CLASS zcl_sd_price_factory DEFINITION
  PUBLIC
  FINAL
  CREATE PRIVATE.

  PUBLIC SECTION.
    CLASS-METHODS get_strategy
      IMPORTING iv_kdgrp           TYPE kdgrp
      RETURNING VALUE(ro_strategy) TYPE REF TO zcl_sd_price_base
      RAISING   zcx_sd_pricing.
ENDCLASS.



CLASS zcl_sd_price_factory IMPLEMENTATION.

  METHOD get_strategy.
    DATA lv_class TYPE seoclsname.

*   Zuordnung Kundengruppe -> Strategieklasse (Pflege SM30 ZSD_PRICE_STRAT)
    SELECT SINGLE strategy_class FROM zsd_price_strat INTO lv_class
      WHERE kdgrp = iv_kdgrp.
    IF sy-subrc <> 0.
      lv_class = 'ZCL_SD_PRICE_RETAIL'.        " Default Einzelhandel
    ENDIF.

    CASE lv_class.
      WHEN 'ZCL_SD_PRICE_WHOLESALE'.
        ro_strategy = NEW zcl_sd_price_wholesale( ).
      WHEN 'ZCL_SD_PRICE_RETAIL'.
        ro_strategy = NEW zcl_sd_price_retail( ).
      WHEN OTHERS.
*       CREATE OBJECT ro_strategy TYPE (lv_class).  "zu riskant, 2019 raus
        RAISE EXCEPTION TYPE zcx_sd_pricing
          EXPORTING
            textid = zcx_sd_pricing=>unknown_strategy
            kdgrp  = iv_kdgrp.
    ENDCASE.
  ENDMETHOD.

ENDCLASS.
