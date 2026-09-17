REPORT zcc_ref_007.
PARAMETERS p_land TYPE c LENGTH 3 DEFAULT 'DE'.
START-OF-SELECTION.
  SELECT a~kunnr, a~name1, b~bukrs, c~vkorg, c~vtweg, c~spart
    FROM kna1 AS a
    INNER JOIN knb1 AS b ON b~kunnr = a~kunnr
    INNER JOIN knvv AS c ON c~kunnr = a~kunnr
    WHERE a~land1 = @p_land
    INTO TABLE @DATA(lt_combinations).
  LOOP AT lt_combinations INTO DATA(ls_row).
    WRITE: / ls_row-kunnr, ls_row-bukrs,
             ls_row-vkorg, ls_row-vtweg, ls_row-spart.
  ENDLOOP.
