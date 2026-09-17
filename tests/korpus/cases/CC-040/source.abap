CLASS zcl_cc_ref_040 DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS get_order_number
      RETURNING VALUE(rv_vbeln) TYPE c LENGTH 10.
ENDCLASS.
CLASS zcl_cc_ref_040 IMPLEMENTATION.
  METHOD get_order_number.
    FIELD-SYMBOLS <lv_vbeln> TYPE any.
    ASSIGN ('(SAPMV45A)VBAK-VBELN') TO <lv_vbeln>.
    IF sy-subrc <> 0.
      CLEAR rv_vbeln.
      RETURN.
    ENDIF.
    rv_vbeln = <lv_vbeln>.
  ENDMETHOD.
ENDCLASS.
