FUNCTION z_wm_rf_inventur.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_LGNUM) TYPE  LGNUM
*"  EXPORTING
*"     VALUE(EV_GEZAEHLT) TYPE  I
*"----------------------------------------------------------------------
* Aufruf aus dem RF-Menue (Transaktion ZLM_INV)

  gv_lgnum = iv_lgnum.
  go_zaehl = NEW #( ).

  CALL SCREEN 0100.

* Anzahl der zuletzt gezaehlten Positionen fuer die Menue-Statistik
  ev_gezaehlt = go_zaehl->anzahl( ).

ENDFUNCTION.
