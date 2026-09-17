REPORT zcc_ref_021.
DATA gv_amount TYPE p LENGTH 9 DECIMALS 2 VALUE '10000'.
DATA gv_result TYPE c LENGTH 20.
INCLUDE zcc_ref_021_rules.
START-OF-SELECTION.
  PERFORM determine_route USING gv_amount CHANGING gv_result.
  WRITE / gv_result.
