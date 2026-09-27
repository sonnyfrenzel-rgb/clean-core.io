FUNCTION z_oil_menge_15grad.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_MATNR) TYPE  MATNR
*"     VALUE(IV_MENGE_L) TYPE  MENGE_D
*"     VALUE(IV_TEMP_C) TYPE  ZOIL_TEMP
*"  EXPORTING
*"     VALUE(EV_MENGE_L15) TYPE  MENGE_D
*"  EXCEPTIONS
*"      KEIN_KOEFFIZIENT
*"      TEMPERATUR_UNPLAUSIBEL
*"----------------------------------------------------------------------
* Umrechnung Liter bei Messtemperatur -> Liter bei 15 Grad C (Tanklager)
  DATA: ls_koef TYPE zoil_koeff,
        lv_dt   TYPE p DECIMALS 3.

  IF iv_temp_c < -30 OR iv_temp_c > 60.
    RAISE temperatur_unplausibel.
  ENDIF.

  SELECT SINGLE * FROM zoil_koeff INTO ls_koef
    WHERE matnr = iv_matnr.
  IF sy-subrc <> 0.
    MESSAGE e012(zoil) WITH iv_matnr RAISING kein_koeffizient.
  ENDIF.

  lv_dt = iv_temp_c - 15.
* vereinfachte lineare Naeherung statt ASTM-Tabelle 54B (Projektentscheid 2012)
  ev_menge_l15 = iv_menge_l * COND #( WHEN ls_koef-alpha IS INITIAL THEN 1
                                      ELSE 1 - ls_koef-alpha * lv_dt ).

ENDFUNCTION.
