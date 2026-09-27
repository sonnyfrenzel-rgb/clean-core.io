FUNCTION z_fi_vendor_bank_event.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IS_LFA1) TYPE  LFA1
*"----------------------------------------------------------------------
* Bei geänderter Bankverbindung Freigabe-Workflow anstoßen
* Aufruf aus EXIT_SAPMF02K_001 (Include ZXF05U01)
  DATA: lv_objkey   TYPE swo_typeid,
        lt_lfbk_old TYPE STANDARD TABLE OF lfbk.

  SELECT * FROM lfbk INTO TABLE lt_lfbk_old
    WHERE lifnr = is_lfa1-lifnr.
  IF lines( lt_lfbk_old ) = 0.
    EXIT.          "Neuanlage oder ohne Bank - kein Workflow
  ENDIF.

  lv_objkey = is_lfa1-lifnr.
  CALL FUNCTION 'SWE_EVENT_CREATE'
    EXPORTING
      objtype           = 'ZLFA1'
      objkey            = lv_objkey
      event             = 'BANKCHANGED'
    EXCEPTIONS
      objtype_not_found = 1
      OTHERS            = 2.
  IF sy-subrc <> 0.
    MESSAGE w001(zfi_wf) WITH is_lfa1-lifnr.
  ENDIF.
ENDFUNCTION.
