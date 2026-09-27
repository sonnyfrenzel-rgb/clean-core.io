FUNCTION z_sd_webshop_log_upd.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein (Start sofort)
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IS_LOG) TYPE  ZSD_WEBSHOP_LOG
*"----------------------------------------------------------------------
* Schlüssel: SHOP_ORDER - ein erneuter Versuch überschreibt den Satz
  MODIFY zsd_webshop_log FROM is_log.
ENDFUNCTION.
