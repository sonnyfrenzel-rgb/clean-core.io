REPORT zcc_ref_030.
PARAMETERS p_route TYPE c LENGTH 20.
START-OF-SELECTION.
  SELECT case_id
    FROM zcc_decision
    WHERE route = 'OPEN'
    INTO @DATA(lv_case).
    UPDATE zcc_decision SET route = @p_route WHERE case_id = @lv_case.
    IF sy-subrc = 0.
      COMMIT WORK.
    ENDIF.
  ENDSELECT.
  WRITE / 'DONE'.
