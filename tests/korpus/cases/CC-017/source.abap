REPORT zcc_ref_017.
PARAMETERS p_amt TYPE i DEFAULT 10001.
CLASS lcl_base DEFINITION.
  PUBLIC SECTION.
    METHODS route IMPORTING iv_amount TYPE i
                  RETURNING VALUE(rv_route) TYPE string.
ENDCLASS.
CLASS lcl_base IMPLEMENTATION.
  METHOD route.
    IF iv_amount > 10000.
      rv_route = 'MANAGER_ROUTE'.
    ELSE.
      rv_route = 'AUTO_ROUTE'.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
CLASS lcl_child DEFINITION INHERITING FROM lcl_base FINAL.
  PUBLIC SECTION.
    METHODS route REDEFINITION.
ENDCLASS.
CLASS lcl_child IMPLEMENTATION.
  METHOD route.
    IF iv_amount < 0.
      rv_route = 'INVALID'.
      RETURN.
    ENDIF.
    rv_route = super->route( iv_amount ).
  ENDMETHOD.
ENDCLASS.
START-OF-SELECTION.
  DATA lo_rule TYPE REF TO lcl_base.
  lo_rule = NEW lcl_child( ).
  DATA(lv_route) = lo_rule->route( p_amt ).
  WRITE / lv_route.
