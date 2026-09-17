REPORT zcc_ref_049.
PARAMETERS p_bukrs TYPE c LENGTH 4 DEFAULT '1000'.
START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'F_KNA1_BUK'
    ID 'BUKRS' FIELD p_bukrs
    ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    WRITE / 'NO_AUTH'.
    RETURN.
  ENDIF.
  SELECT kunnr, bukrs
    FROM knb1
    WHERE bukrs = @p_bukrs
    ORDER BY kunnr
    INTO TABLE @DATA(lt_customers).
  AUTHORITY-CHECK OBJECT 'F_KNA1_GEN'
    ID 'ACTVT' FIELD '03'.
  LOOP AT lt_customers INTO DATA(ls_customer).
    WRITE: / ls_customer-kunnr, ls_customer-bukrs.
  ENDLOOP.
