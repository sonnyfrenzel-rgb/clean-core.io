REPORT zcc_ref_045.
TABLES: kna1.
SELECT-OPTIONS s_kunnr FOR kna1-kunnr.
TYPES: BEGIN OF ty_cust.
         INCLUDE STRUCTURE kna1.
TYPES:   flag TYPE c LENGTH 1,
       END OF ty_cust.
DATA ls_cust TYPE ty_cust.
DATA ls_kna1 TYPE kna1.
START-OF-SELECTION.
  ls_kna1-kunnr = '0000001000'.
  MOVE-CORRESPONDING ls_kna1 TO ls_cust.
  ls_cust-flag = 'X'.
  IF s_kunnr[] IS INITIAL.
    WRITE / 'NO_RESTRICTION'.
  ENDIF.
  WRITE: / ls_cust-kunnr, ls_cust-flag.
