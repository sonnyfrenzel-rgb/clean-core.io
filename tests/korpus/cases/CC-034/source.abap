REPORT zcc_ref_034.
PARAMETERS p_kunnr TYPE c LENGTH 10.
PARAMETERS p_name TYPE c LENGTH 35 LOWER CASE.
DATA lv_sql TYPE string.
DATA lv_rows TYPE i.
START-OF-SELECTION.
  IF p_kunnr IS INITIAL.
    WRITE / 'NO_KEY'.
    RETURN.
  ENDIF.
  lv_sql = |UPDATE KNA1 SET NAME1 = '{ p_name }' | &&
           |WHERE MANDT = '{ sy-mandt }' AND KUNNR = '{ p_kunnr }'|.
  TRY.
      DATA(lo_stmt) = NEW cl_sql_statement( ).
      lv_rows = lo_stmt->execute_update( lv_sql ).
    CATCH cx_sql_exception.
      ROLLBACK WORK.
      WRITE / 'DB_ERROR'.
      RETURN.
  ENDTRY.
  IF lv_rows = 0.
    ROLLBACK WORK.
    WRITE / 'NO_UPDATE'.
    RETURN.
  ENDIF.
  COMMIT WORK.
  WRITE / 'UPDATE_COMMITTED'.
