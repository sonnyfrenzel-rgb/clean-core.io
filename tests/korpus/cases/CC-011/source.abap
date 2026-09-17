REPORT zcc_ref_011.
PARAMETERS p_id TYPE c LENGTH 10 DEFAULT '42'.
DATA lv_function TYPE c LENGTH 30.
DATA lv_output TYPE c LENGTH 10.
START-OF-SELECTION.
  lv_function = 'CONVERSION_EXIT_ALPHA_INPUT'.
  CALL FUNCTION lv_function
    EXPORTING input = p_id
    IMPORTING output = lv_output.
  WRITE / lv_output.
