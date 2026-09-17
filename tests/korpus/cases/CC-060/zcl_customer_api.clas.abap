CLASS zcl_customer_api DEFINITION PUBLIC FINAL CREATE PRIVATE.
  PUBLIC SECTION.
    CLASS-METHODS get_name
      IMPORTING iv_kunnr       TYPE c
      RETURNING VALUE(rv_name) TYPE string.
ENDCLASS.

CLASS zcl_customer_api IMPLEMENTATION.
  METHOD get_name.
    SELECT SINGLE name1
      FROM kna1
      WHERE kunnr = @iv_kunnr
      INTO @DATA(lv_name).
    IF sy-subrc = 0.
      rv_name = lv_name.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
