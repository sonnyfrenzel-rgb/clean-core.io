REPORT zcc_ref_031.
PARAMETERS p_id TYPE c LENGTH 10.
PARAMETERS p_route TYPE c LENGTH 20.
PARAMETERS p_dest TYPE c LENGTH 32.
START-OF-SELECTION.
  UPDATE zcc_decision SET route = @p_route WHERE case_id = @p_id.
  IF sy-subrc <> 0.
    WRITE / 'MISSING_CASE'.
    RETURN.
  ENDIF.
  CALL FUNCTION 'Z_CC_NOTIFY'
    DESTINATION p_dest
    EXPORTING iv_case_id = p_id
    EXCEPTIONS communication_failure = 1
               system_failure        = 2
               OTHERS                = 3.
  IF sy-subrc <> 0.
    ROLLBACK WORK.
    WRITE / 'NOTIFY_FAILED'.
    RETURN.
  ENDIF.
  COMMIT WORK.
  WRITE / 'RECORDED'.
