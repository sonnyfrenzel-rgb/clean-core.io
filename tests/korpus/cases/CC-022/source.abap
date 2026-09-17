REPORT zcc_ref_022.
DATA lv_result TYPE string.
START-OF-SELECTION.
  lv_result = /acme/cl_route=>determine( iv_amount = 25000 ).
  WRITE / lv_result.
