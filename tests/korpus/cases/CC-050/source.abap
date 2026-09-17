REPORT zcc_ref_050.
PARAMETERS p_land TYPE c LENGTH 3 DEFAULT 'DE'.
START-OF-SELECTION.
  SELECT customer, customername, country
    FROM i_customer WITH PRIVILEGED ACCESS
    WHERE country = @p_land
    ORDER BY customer
    INTO TABLE @DATA(lt_customers).
  IF lt_customers IS INITIAL.
    WRITE / 'NO_MATCH'.
    RETURN.
  ENDIF.
  LOOP AT lt_customers INTO DATA(ls_customer).
    WRITE: / ls_customer-customer, ls_customer-customername.
  ENDLOOP.
