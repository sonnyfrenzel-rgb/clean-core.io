REPORT zcc_ref_010.
DATA gv_review TYPE c LENGTH 1.
PARAMETERS p_amount TYPE p LENGTH 9 DECIMALS 2 DEFAULT '25000'.
START-OF-SELECTION.
  PERFORM copied_host_logic.
  WRITE / gv_review.
FORM copied_host_logic.
  gv_review = 'N'.
  " The inserted fragment is evaluated with host metadata in context.json.
  IF p_amount > 20000.
    gv_review = 'Y'.
  ENDIF.
ENDFORM.
