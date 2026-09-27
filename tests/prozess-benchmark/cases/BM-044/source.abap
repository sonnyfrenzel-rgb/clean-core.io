FUNCTION z_fi_amount_to_local.
*"  IMPORTING
*"     VALUE(IV_BUKRS) TYPE  BUKRS
*"     VALUE(IV_WAERS) TYPE  WAERS
*"     VALUE(IV_WRBTR) TYPE  WRBTR
*"     VALUE(IV_DATUM) TYPE  DATUM DEFAULT SY-DATUM
*"  EXPORTING
*"     VALUE(EV_DMBTR) TYPE  DMBTR
*"     VALUE(EV_KURSF) TYPE  KURSF
*"  EXCEPTIONS
*"      COMPANY_NOT_FOUND
*"      NO_RATE
  DATA lv_hwaer TYPE waers.

  SELECT SINGLE waers FROM t001 INTO lv_hwaer
    WHERE bukrs = iv_bukrs.
  IF sy-subrc <> 0.
    RAISE company_not_found.
  ENDIF.

* Kurstyp M = Durchschnittskurs (Vorgabe Treasury)
  CALL FUNCTION 'CONVERT_TO_LOCAL_CURRENCY'
    EXPORTING
      date             = iv_datum
      foreign_amount   = iv_wrbtr
      foreign_currency = iv_waers
      local_currency   = lv_hwaer
      type_of_rate     = 'M'
    IMPORTING
      exchange_rate    = ev_kursf
      local_amount     = ev_dmbtr
    EXCEPTIONS
      no_rate_found    = 1
      overflow         = 2
      no_factors_found = 3
      OTHERS           = 4.
  IF sy-subrc <> 0.
    RAISE no_rate.
  ENDIF.
ENDFUNCTION.
