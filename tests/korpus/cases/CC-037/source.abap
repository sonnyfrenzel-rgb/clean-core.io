REPORT zcc_ref_037.
PARAMETERS p_tab TYPE c LENGTH 30 DEFAULT 'KNA1'.
DATA lv_count TYPE i.
START-OF-SELECTION.
  IF p_tab IS INITIAL.
    WRITE / 'NO_TABLE'.
    RETURN.
  ENDIF.
  SELECT COUNT(*)
    FROM (p_tab)
    INTO @lv_count.
  WRITE: / p_tab, lv_count.
