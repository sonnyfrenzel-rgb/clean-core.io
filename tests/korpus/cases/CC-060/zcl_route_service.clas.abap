CLASS zcl_route_service DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS determine
      IMPORTING iv_kunnr        TYPE c
                iv_amount       TYPE p
      RETURNING VALUE(rv_route) TYPE string.
ENDCLASS.

CLASS zcl_route_service IMPLEMENTATION.
  METHOD determine.
    DATA(lv_name) = zcl_customer_api=>get_name( iv_kunnr ).
    IF lv_name IS INITIAL.
      rv_route = 'UNKNOWN_CUSTOMER'.
      RETURN.
    ENDIF.
    rv_route = COND #( WHEN iv_amount > 10000 THEN 'MANAGER_ROUTE' ELSE 'AUTO_ROUTE' ).
  ENDMETHOD.
ENDCLASS.
