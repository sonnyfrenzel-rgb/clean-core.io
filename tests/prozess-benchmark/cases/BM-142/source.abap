FUNCTION z_pt_terminal_check_badge.
*"----------------------------------------------------------------------
*"  IMPORTING
*"     VALUE(IV_ZAUSW) TYPE  PA0050-ZAUSW
*"     VALUE(IV_DATE)  TYPE  SY-DATUM DEFAULT SY-DATUM
*"  EXPORTING
*"     VALUE(EV_PERNR) TYPE  PERNR_D
*"  EXCEPTIONS
*"     BADGE_UNKNOWN
*"     EMPLOYEE_INACTIVE
*"----------------------------------------------------------------------
* Aufruf per RFC vom Zeiterfassungsterminal (Subsystem) beim Buchen
  DATA lv_stat2 TYPE pa0000-stat2.

  SELECT SINGLE pernr FROM pa0050 INTO ev_pernr
    WHERE zausw = iv_zausw
      AND begda <= iv_date
      AND endda >= iv_date.
  IF sy-subrc <> 0.
    MESSAGE e001(zpt_term) WITH iv_zausw RAISING badge_unknown.
  ENDIF.

  SELECT SINGLE stat2 FROM pa0000 INTO lv_stat2
    WHERE pernr = ev_pernr
      AND begda <= iv_date
      AND endda >= iv_date.
  IF lv_stat2 <> '3'.
    CLEAR ev_pernr.
    RAISE employee_inactive.
  ENDIF.

ENDFUNCTION.
