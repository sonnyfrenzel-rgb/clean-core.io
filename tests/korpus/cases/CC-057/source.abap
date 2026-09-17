CLASS zcl_cc_customer_country DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS get_country
      IMPORTING iv_kunnr        TYPE c
      RETURNING VALUE(rv_land1) TYPE string.
ENDCLASS.

CLASS zcl_cc_customer_country IMPLEMENTATION.
  METHOD get_country.
    SELECT SINGLE land1
      FROM kna1
      WHERE kunnr = @iv_kunnr
      INTO @DATA(lv_land1).
    IF sy-subrc = 0.
      rv_land1 = lv_land1.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
