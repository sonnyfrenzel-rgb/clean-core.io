FUNCTION z_sd_reprice_log_upd.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein (Start sofort)
*"*"Lokale Schnittstelle:
*"  TABLES
*"      IT_LOG STRUCTURE  ZSD_REPRICE_LOG
*"----------------------------------------------------------------------
* Aufruf aus ZSD_REPRICE (IN UPDATE TASK), Schlüssel VBELN/DATUM/UZEIT
* MODIFY: ein zweiter Lauf in derselben Sekunde überschreibt den Satz
  MODIFY zsd_reprice_log FROM TABLE it_log.
  IF sy-subrc <> 0.
    MESSAGE a803(zsd).
  ENDIF.
ENDFUNCTION.
