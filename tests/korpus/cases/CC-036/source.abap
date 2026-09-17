REPORT zcc_ref_036.
CONSTANTS lc_tab TYPE c LENGTH 30 VALUE 'KNA1'.
PARAMETERS p_land TYPE c LENGTH 3 DEFAULT 'DE'.
TYPES: BEGIN OF ty_row,
         kunnr TYPE c LENGTH 10,
         name1 TYPE c LENGTH 35,
       END OF ty_row.
DATA lt_rows TYPE STANDARD TABLE OF ty_row.
START-OF-SELECTION.
  SELECT kunnr, name1
    FROM (lc_tab)
    WHERE land1 = @p_land
    ORDER BY kunnr
    INTO TABLE @lt_rows.
  IF lt_rows IS INITIAL.
    WRITE / 'NO_MATCH'.
    RETURN.
  ENDIF.
  LOOP AT lt_rows INTO DATA(ls_row).
    WRITE: / ls_row-kunnr, ls_row-name1.
  ENDLOOP.
