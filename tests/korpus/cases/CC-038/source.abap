REPORT zcc_ref_038.
PARAMETERS p_tab TYPE c LENGTH 30 DEFAULT 'ZCC_LOG_A'.
PARAMETERS p_key TYPE c LENGTH 10.
PARAMETERS p_text TYPE c LENGTH 40 LOWER CASE.
DATA ls_row TYPE zcc_log_row.
START-OF-SELECTION.
  IF p_key IS INITIAL.
    WRITE / 'NO_KEY'.
    RETURN.
  ENDIF.
  ls_row-mandt = sy-mandt.
  ls_row-log_key = p_key.
  ls_row-log_text = p_text.
  MODIFY (p_tab) FROM @ls_row.
  IF sy-subrc = 0.
    COMMIT WORK.
    WRITE / 'SAVED'.
  ELSE.
    ROLLBACK WORK.
    WRITE / 'NOT_SAVED'.
  ENDIF.
