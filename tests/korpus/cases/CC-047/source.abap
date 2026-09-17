REPORT zcc_ref_047.
NODES: kna1.
DATA gv_count TYPE i.
START-OF-SELECTION.
  gv_count = 0.
GET kna1.
  gv_count = gv_count + 1.
  WRITE: / kna1-kunnr, kna1-name1.
END-OF-SELECTION.
  WRITE: / 'COUNT', gv_count.
