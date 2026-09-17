REPORT zcc_ref_051.
PARAMETERS p_mandt TYPE c LENGTH 3 DEFAULT '100'.
PARAMETERS p_kunnr TYPE c LENGTH 10.
START-OF-SELECTION.
  SELECT SINGLE mandt, kunnr, name1
    FROM kna1 CLIENT SPECIFIED
    WHERE mandt = @p_mandt
      AND kunnr = @p_kunnr
    INTO @DATA(ls_customer).
  IF sy-subrc <> 0.
    WRITE / 'NO_MATCH'.
    RETURN.
  ENDIF.
  WRITE: / ls_customer-mandt, ls_customer-kunnr, ls_customer-name1.
