REPORT zcc_ref_033.
PARAMETERS p_id TYPE c LENGTH 10.
PARAMETERS p_route TYPE c LENGTH 20.
START-OF-SELECTION.
  UPDATE zcc_decision SET route = @p_route WHERE case_id = @p_id.
  IF sy-subrc <> 0.
    WRITE / 'MISSING_CASE'.
    RETURN.
  ENDIF.
  UPDATE zcc_case SET status = 'ROUTED' WHERE case_id = @p_id.
  IF sy-subrc <> 0.
    MESSAGE e001(zcc) WITH p_id.
  ENDIF.
  COMMIT WORK.
  WRITE / 'RECORDED'.
