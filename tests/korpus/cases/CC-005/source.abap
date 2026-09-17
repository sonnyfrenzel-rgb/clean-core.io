REPORT zcc_ref_005.
PARAMETERS p_id TYPE c LENGTH 10 DEFAULT '123'.
DATA lv_internal TYPE c LENGTH 10.
DATA lv_external TYPE c LENGTH 10.
START-OF-SELECTION.
  CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
    EXPORTING input = p_id
    IMPORTING output = lv_internal.
  CALL FUNCTION 'CONVERSION_EXIT_ALPHA_OUTPUT'
    EXPORTING input = lv_internal
    IMPORTING output = lv_external.
  WRITE: / lv_internal, / lv_external.
