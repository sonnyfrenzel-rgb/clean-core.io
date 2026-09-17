CLASS zcl_cc_route_impl DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES zif_cc_route.
ENDCLASS.
CLASS zcl_cc_route_impl IMPLEMENTATION.
  METHOD zif_cc_route~determine.
    IF iv_amount > 10000.
      cv_route = 'MANAGER_ROUTE'.
    ELSE.
      cv_route = 'AUTO_ROUTE'.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
