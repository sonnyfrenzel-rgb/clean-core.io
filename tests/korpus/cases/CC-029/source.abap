REPORT zcc_ref_029.
PARAMETERS p_id TYPE c LENGTH 10.
PARAMETERS p_route TYPE c LENGTH 20.
START-OF-SELECTION.
  CALL FUNCTION 'ENQUEUE_EZCC_DECISION'
    EXPORTING case_id        = p_id
    EXCEPTIONS foreign_lock   = 1
               system_failure = 2
               OTHERS         = 3.
  IF sy-subrc <> 0.
    WRITE / 'LOCK_FAILED'.
    RETURN.
  ENDIF.
  UPDATE zcc_decision SET route = @p_route WHERE case_id = @p_id.
  IF sy-subrc = 0.
    COMMIT WORK.
  ELSE.
    ROLLBACK WORK.
  ENDIF.
  CALL FUNCTION 'DEQUEUE_EZCC_DECISION'
    EXPORTING case_id = p_id.
  WRITE / 'DONE'.
