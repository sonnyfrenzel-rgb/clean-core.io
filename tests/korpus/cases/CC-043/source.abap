REPORT zcc_ref_043.
PARAMETERS p_log AS CHECKBOX DEFAULT 'X'.
DATA gv_total TYPE i.
INCLUDE zcc_ref_043_forms.
START-OF-SELECTION.
  PERFORM: read_hdr, read_items, sum_items.
  IF p_log = 'X'.
    PERFORM write_log.
  ENDIF.
  WRITE: / 'DONE', gv_total.
