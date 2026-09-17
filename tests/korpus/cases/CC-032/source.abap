REPORT zcc_ref_032.
PARAMETERS p_id TYPE c LENGTH 10.
DATA gv_route TYPE c LENGTH 20.
DATA gv_done TYPE abap_bool.
START-OF-SELECTION.
  CALL FUNCTION 'Z_CC_ROUTE_CALC'
    STARTING NEW TASK 'ROUTE1'
    PERFORMING on_end ON END OF TASK
    EXPORTING iv_case_id = p_id
    EXCEPTIONS communication_failure = 1
               system_failure        = 2
               resource_failure      = 3.
  IF sy-subrc <> 0.
    WRITE / 'NOT_STARTED'.
    RETURN.
  ENDIF.
  WRITE / 'STARTED'.
FORM on_end USING p_task TYPE clike.
  RECEIVE RESULTS FROM FUNCTION 'Z_CC_ROUTE_CALC'
    IMPORTING ev_route = gv_route.
  gv_done = abap_true.
ENDFORM.
