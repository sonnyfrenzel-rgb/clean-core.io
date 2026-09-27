CLASS zcl_mm_gr_notifier DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS on_posted FOR EVENT posted OF zcl_mm_gr_poster
      IMPORTING ev_docnum ev_mblnr.
    METHODS on_failed FOR EVENT failed OF zcl_mm_gr_poster
      IMPORTING ev_docnum ev_code ev_ebeln.
ENDCLASS.



CLASS zcl_mm_gr_notifier IMPLEMENTATION.

  METHOD on_posted.
    DATA ls_jour TYPE zmm_gr_journal.
    ls_jour-docnum = ev_docnum.
    ls_jour-mblnr  = ev_mblnr.
    ls_jour-status = 'OK'.
    ls_jour-erdat  = sy-datum.
    ls_jour-erzet  = sy-uzeit.
    INSERT zmm_gr_journal FROM ls_jour.
  ENDMETHOD.


  METHOD on_failed.
    DATA ls_jour TYPE zmm_gr_journal.
    ls_jour-docnum = ev_docnum.
    ls_jour-ebeln  = ev_ebeln.
    ls_jour-status = ev_code.
    ls_jour-erdat  = sy-datum.
    ls_jour-erzet  = sy-uzeit.
    INSERT zmm_gr_journal FROM ls_jour.

*   Ueberlieferung: Einkaeufer informieren (Mail ueber Z-Baustein)
    IF ev_code = 'OVER'.
      CALL FUNCTION 'Z_MM_NOTIFY_BUYER'
        EXPORTING
          iv_ebeln  = ev_ebeln
          iv_reason = 'Ueberlieferung laut Dienstleister'.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
