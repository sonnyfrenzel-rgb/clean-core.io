REPORT zcc_ref_025.
PARAMETERS p_amount TYPE p LENGTH 9 DECIMALS 2 DEFAULT '50000'.
PARAMETERS p_curr TYPE c LENGTH 3 DEFAULT 'EUR'.
PARAMETERS p_urgent AS CHECKBOX.
PARAMETERS p_night AS CHECKBOX.
PARAMETERS p_deleg AS CHECKBOX.
DATA lv_route TYPE string.
START-OF-SELECTION.
  IF p_amount < 0.
    lv_route = 'INVALID_AMOUNT'.
  ELSEIF p_curr <> 'EUR'.
    lv_route = 'CURRENCY_REVIEW'.
  ELSEIF p_urgent = 'X' AND p_amount <= 50000.
    IF p_night = 'X' AND p_deleg <> 'X'.
      lv_route = 'DELEGATE_REQUIRED'.
    ELSE.
      lv_route = 'EMERGENCY_ROUTE'.
    ENDIF.
  ELSEIF p_amount > 10000.
    lv_route = 'MANAGER_ROUTE'.
  ELSE.
    lv_route = 'AUTO_ROUTE'.
  ENDIF.
  WRITE / lv_route.
