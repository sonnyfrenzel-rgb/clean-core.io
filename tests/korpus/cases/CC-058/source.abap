REPORT zcc_ref_058.
PARAMETERS p_land TYPE c LENGTH 3 DEFAULT 'DE'.
START-OF-SELECTION.
  SELECT Customer, CustomerName, Country
    FROM i_customer
    WHERE Country = @p_land
    ORDER BY Customer
    INTO TABLE @DATA(lt_customers).
  IF lt_customers IS INITIAL.
    WRITE / 'NO_MATCH'.
    RETURN.
  ENDIF.
  LOOP AT lt_customers INTO DATA(ls_customer).
    WRITE: / ls_customer-Customer, ls_customer-CustomerName.
  ENDLOOP.
