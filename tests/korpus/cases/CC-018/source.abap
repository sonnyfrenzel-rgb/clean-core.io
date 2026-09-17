REPORT zcc_ref_018.
CLASS lcl_child DEFINITION INHERITING FROM zcl_cc_missing_base FINAL.
  PUBLIC SECTION.
    METHODS route REDEFINITION.
ENDCLASS.
CLASS lcl_child IMPLEMENTATION.
  METHOD route.
    super->route( ).
  ENDMETHOD.
ENDCLASS.
START-OF-SELECTION.
  DATA(lo_rule) = NEW lcl_child( ).
  lo_rule->route( ).
