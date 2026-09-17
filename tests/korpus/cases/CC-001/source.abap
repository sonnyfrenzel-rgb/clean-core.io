REPORT zcc_ref_001.
PARAMETERS p_land TYPE c LENGTH 3 DEFAULT 'DE'.
START-OF-SELECTION.
  SELECT kunnr, name1, land1
    FROM kna1
    WHERE land1 = @p_land
    ORDER BY kunnr
    INTO TABLE @DATA(lt_customers).
  IF lt_customers IS INITIAL.
    WRITE / 'NO_MATCH'.
    RETURN.
  ENDIF.
  LOOP AT lt_customers INTO DATA(ls_customer).
    WRITE: / ls_customer-kunnr, ls_customer-name1.
  ENDLOOP.
