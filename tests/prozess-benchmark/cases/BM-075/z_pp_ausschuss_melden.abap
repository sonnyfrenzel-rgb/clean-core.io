FUNCTION z_pp_ausschuss_melden.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein:  (Start sofort)
*"
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_AUFNR) TYPE  AUFNR
*"     VALUE(IV_VORNR) TYPE  VORNR
*"     VALUE(IV_WERKS) TYPE  WERKS_D
*"     VALUE(IV_XMNGA) TYPE  RU_XMNGA
*"     VALUE(IV_QUOTE) TYPE  ZPP_QUOTE
*"     VALUE(IV_GRUND) TYPE  CO_AGRND
*"----------------------------------------------------------------------
  DATA: ls_log   TYPE zpp_auss_log,
        lv_objky TYPE swo_typeid,
        lt_cont  TYPE STANDARD TABLE OF swcont.

  ls_log-mandt = sy-mandt.
  ls_log-aufnr = iv_aufnr.
  ls_log-vornr = iv_vornr.
  ls_log-werks = iv_werks.
  ls_log-xmnga = iv_xmnga.
  ls_log-quote = iv_quote.
  ls_log-grund = iv_grund.
  ls_log-erdat = sy-datum.
  ls_log-ernam = sy-uname.
  INSERT zpp_auss_log FROM ls_log.
  IF sy-subrc <> 0.
*   Doppelte Meldung am selben Tag - nur Menge erhoehen
    UPDATE zpp_auss_log SET xmnga = xmnga + iv_xmnga
      WHERE aufnr = iv_aufnr
        AND vornr = iv_vornr
        AND erdat = sy-datum.
    RETURN.
  ENDIF.

* QS-Workflow nur beim ersten Ueberschreiten je Tag anstossen
  lv_objky = iv_aufnr.
  CALL FUNCTION 'SWE_EVENT_CREATE'
    EXPORTING
      objtype           = 'BUS2005'
      objkey            = lv_objky
      event             = 'ZSCRAPEXCEEDED'
    TABLES
      event_container   = lt_cont
    EXCEPTIONS
      objtype_not_found = 1
      OTHERS            = 2.

ENDFUNCTION.
