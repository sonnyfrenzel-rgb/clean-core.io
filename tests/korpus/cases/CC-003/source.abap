REPORT zcc_ref_003.
CLASS lcl_route DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS decide IMPORTING iv_amount TYPE decfloat34
                         RETURNING VALUE(rv_route) TYPE string.
ENDCLASS.
CLASS lcl_route IMPLEMENTATION.
  METHOD decide.
    IF iv_amount < 0.
      rv_route = 'INVALID'.
    ELSEIF iv_amount <= 10000.
      rv_route = 'AUTO_ROUTE'.
    ELSE.
      rv_route = 'MANAGER_ROUTE'.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
PARAMETERS p_amount TYPE p LENGTH 9 DECIMALS 2.
START-OF-SELECTION.
  DATA(lv_route) = lcl_route=>decide( CONV decfloat34( p_amount ) ).
  WRITE / lv_route.
