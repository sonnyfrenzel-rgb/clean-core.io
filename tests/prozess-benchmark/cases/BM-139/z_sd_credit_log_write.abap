FUNCTION z_sd_credit_log_write.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein (Start sofort)
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IS_RESULT) TYPE  ZSD_S_CREDIT_RESULT
*"     VALUE(IV_UNAME) TYPE  SYUNAME
*"----------------------------------------------------------------------
* Protokoll jeder Kreditentscheidung beim Sichern eines Auftrags
* Aufruf IN UPDATE TASK aus USEREXIT_SAVE_DOCUMENT (MV45AFZZ).
*----------------------------------------------------------------------
  DATA ls_log TYPE zsd_credit_log.

  MOVE-CORRESPONDING is_result TO ls_log.
  ls_log-datum = sy-datum.
  ls_log-zeit  = sy-uzeit.
  ls_log-uname = iv_uname.

  INSERT zsd_credit_log FROM ls_log.
ENDFUNCTION.
