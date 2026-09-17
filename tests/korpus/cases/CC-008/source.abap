REPORT zcc_ref_008.
PARAMETERS p_bukrs TYPE c LENGTH 4 DEFAULT '1000'.
START-OF-SELECTION.
  SELECT a~kunnr, b~bukrs, c~vkorg, c~vtweg, c~spart
    FROM kna1 AS a
    LEFT OUTER JOIN knb1 AS b ON b~kunnr = a~kunnr
    LEFT OUTER JOIN knvv AS c ON c~kunnr = a~kunnr
    WHERE b~bukrs = @p_bukrs
    INTO TABLE @DATA(lt_rows).
  LOOP AT lt_rows INTO DATA(ls_row).
    WRITE: / ls_row-kunnr, ls_row-bukrs, ls_row-vkorg.
  ENDLOOP.
