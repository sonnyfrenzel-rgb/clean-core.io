REPORT zcc_ref_009.
PARAMETERS p_amount TYPE p LENGTH 9 DECIMALS 2 DEFAULT '15000'.
DATA lo_badi TYPE REF TO zbadi_cc_route.
DATA lv_route TYPE string.
START-OF-SELECTION.
  GET BADI lo_badi.
  CALL BADI lo_badi->determine
    EXPORTING iv_amount = p_amount
    CHANGING cv_route = lv_route.
  WRITE / lv_route.
