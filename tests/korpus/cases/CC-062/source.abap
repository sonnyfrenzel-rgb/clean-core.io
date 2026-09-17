REPORT zce_predicate.
PARAMETERS p_where TYPE c LENGTH 72 DEFAULT `LAND1 = 'DE'`.
DATA lv_count TYPE i.
START-OF-SELECTION.
  SELECT COUNT(*) FROM kna1 WHERE (p_where) INTO @lv_count.
  WRITE / lv_count.
