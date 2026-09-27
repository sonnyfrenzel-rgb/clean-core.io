FUNCTION z_fm_fipex_pruefen.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_FIKRS) TYPE  FIKRS
*"     VALUE(IV_GJAHR) TYPE  GJAHR
*"     VALUE(IV_FIPEX) TYPE  FM_FIPEX
*"  EXPORTING
*"     VALUE(EV_FIVOR) TYPE  FM_FIVOR
*"  EXCEPTIONS
*"      NOT_FOUND
*"      NO_EXPENDITURE
*"----------------------------------------------------------------------
* Prüft vor der Übernahme von Haushaltsansätzen aus der Kämmerei-Excel,
* ob die Finanzposition im Jahr existiert und eine Ausgabeposition ist.
  DATA ls_fmci TYPE fmci.

  SELECT SINGLE * FROM fmci INTO ls_fmci
    WHERE fikrs = iv_fikrs
      AND gjahr = iv_gjahr
      AND fipex = iv_fipex.
  IF sy-subrc <> 0.
    MESSAGE e001(zfm) WITH iv_fipex iv_fikrs RAISING not_found.
  ENDIF.

* Positionstyp 3 = Ausgaben; Einnahmepositionen dürfen nicht beplant werden
  IF ls_fmci-potyp <> '3'.
    RAISE no_expenditure.
  ENDIF.

  ev_fivor = ls_fmci-fivor.
ENDFUNCTION.
