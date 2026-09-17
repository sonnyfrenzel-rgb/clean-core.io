REPORT zcc_ref_042.
DATA lv_count TYPE i.
DEFINE count_rows.
  SELECT COUNT(*) FROM &1 INTO @lv_count.
END-OF-DEFINITION.
START-OF-SELECTION.
  count_rows kna1.
  WRITE: / 'KNA1', lv_count.
  count_rows knb1.
  WRITE: / 'KNB1', lv_count.
