FUNCTION z_pm_freisch_verbuchen.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein:
*"
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_AUFNR) TYPE  AUFNR
*"  TABLES
*"      IT_FREISCH STRUCTURE  ZPM_FREISCH
*"----------------------------------------------------------------------
* Freischaltschritte eines Auftrags schreiben und jede Statusänderung
* protokollieren (Nachweis gegenüber Berufsgenossenschaft)
* Aufruf IN UPDATE TASK aus SAPMZPM_FREISCHALT, FORM SICHERN
* 2019-02 JHO  Erstellung
* 2022-09 EXT  Protokoll ZPM_FREISCH_LOG
*----------------------------------------------------------------------
  MODIFY zpm_freisch FROM TABLE it_freisch.

  INSERT zpm_freisch_log FROM TABLE @( VALUE #( FOR ls_f IN it_freisch[]
                                                ( aufnr   = iv_aufnr
                                                  aufpl   = ls_f-aufpl
                                                  aplzl   = ls_f-aplzl
                                                  schritt = ls_f-schritt
                                                  status  = ls_f-status
                                                  uname   = sy-uname
                                                  datum   = sy-datum
                                                  uzeit   = sy-uzeit ) ) )
    ACCEPTING DUPLICATE KEYS.
ENDFUNCTION.
