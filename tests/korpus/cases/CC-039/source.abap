REPORT zcc_ref_039.
PARAMETERS p_rule TYPE c LENGTH 80 LOWER CASE.
PARAMETERS p_amt TYPE i DEFAULT 10001.
DATA lt_src TYPE STANDARD TABLE OF string.
DATA lv_prog TYPE syrepid.
DATA lv_msg TYPE string.
DATA lv_route TYPE string.
START-OF-SELECTION.
  APPEND 'PROGRAM.' TO lt_src.
  APPEND 'FORM eval USING iv_amount TYPE i CHANGING cv_route TYPE string.' TO lt_src.
  APPEND p_rule TO lt_src.
  APPEND 'ENDFORM.' TO lt_src.
  GENERATE SUBROUTINE POOL lt_src NAME lv_prog MESSAGE lv_msg.
  IF sy-subrc <> 0.
    WRITE: / 'GENERATION_FAILED', lv_msg.
    RETURN.
  ENDIF.
  PERFORM eval IN PROGRAM (lv_prog) IF FOUND USING p_amt CHANGING lv_route.
  WRITE / lv_route.
