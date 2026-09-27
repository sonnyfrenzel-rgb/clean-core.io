CLASS zcl_sd_price_wholesale DEFINITION
  PUBLIC
  INHERITING FROM zcl_sd_price_base
  FINAL
  CREATE PUBLIC.

  PROTECTED SECTION.
    METHODS apply_discount REDEFINITION.
ENDCLASS.



CLASS zcl_sd_price_wholesale IMPLEMENTATION.

  METHOD apply_discount.
    DATA: lv_kstbm  TYPE kstbm,
          lv_rabatt TYPE p LENGTH 5 DECIMALS 2.

    rv_net = iv_base.
*   Mengenstaffel Grosshandel, hoechste erreichte Staffel gewinnt
    SELECT kstbm rabatt FROM zsd_whs_scale
      INTO (lv_kstbm, lv_rabatt)
      WHERE kdgrp = is_komk-kdgrp
      ORDER BY kstbm DESCENDING.
      IF is_komp-mglme >= lv_kstbm.
        rv_net = iv_base * ( 100 - lv_rabatt ) / 100.
        EXIT.
      ENDIF.
    ENDSELECT.
  ENDMETHOD.

ENDCLASS.
