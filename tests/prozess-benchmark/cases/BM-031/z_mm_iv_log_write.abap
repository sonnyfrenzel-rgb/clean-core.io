FUNCTION z_mm_iv_log_write.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein:
*"  TABLES
*"      IT_LOG STRUCTURE  ZMM_IV_LOG
*"----------------------------------------------------------------------
* Abweichungsprotokoll Rechnungspruefung (Verbuchung V1)
  DATA ls_log TYPE zmm_iv_log.

  LOOP AT it_log INTO ls_log.
    ls_log-status = 'O'.          "offen fuer Kreditorenbuchhaltung
    MODIFY zmm_iv_log FROM ls_log.
    IF sy-subrc <> 0.
      MESSAGE a121(zmm) WITH ls_log-belnr ls_log-buzei.
    ENDIF.
  ENDLOOP.

ENDFUNCTION.
