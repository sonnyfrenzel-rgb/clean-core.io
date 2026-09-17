REPORT zcc_ref_044.
PARAMETERS p_id TYPE c LENGTH 10 DEFAULT '123'.
DATA lv_internal TYPE c LENGTH 10.
START-OF-SELECTION.
  IF p_id IS INITIAL.
    WRITE / 'NO_INPUT'.
    RETURN.
  ENDIF.
  CALL FUNCTION
    'CONVERSION_EXIT_ALPHA_INPUT'
    EXPORTING
      input  = p_id
    IMPORTING
      output = lv_internal.
  WRITE / lv_internal.
