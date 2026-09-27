FUNCTION z_pm_notif_created_rec.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  Ereignisempfaenger (SWETYPV): BUS2038 CREATED -> Z_PM_NOTIF_CREATED_REC
*"  IMPORTING
*"     VALUE(EVENT) LIKE  SWETYPECOU-EVENT
*"     VALUE(RECTYPE) LIKE  SWETYPECOU-RECTYPE
*"     VALUE(OBJTYPE) LIKE  SWETYPECOU-OBJTYPE
*"     VALUE(OBJKEY) LIKE  SWEINSTCOU-OBJKEY
*"     VALUE(EXCEPTIONS_ALLOWED) LIKE  SWEFLAGS-EXC_OK DEFAULT SPACE
*"  EXPORTING
*"     VALUE(REC_ID) LIKE  SWELOG-RECID
*"  TABLES
*"      EVENT_CONTAINER STRUCTURE  SWCONT
*"  EXCEPTIONS
*"      TEMP_ERROR
*"      ANY_ERROR
*"----------------------------------------------------------------------
  DATA: lv_qmnum TYPE qmnum,
        lv_priok TYPE priok,
        lv_qmart TYPE qmart,
        lo_proc  TYPE REF TO zcl_pm_breakdown_processor,
        lx_err   TYPE REF TO zcx_pm_breakdown,
        lv_text  TYPE string.

  lv_qmnum = objkey.

* nur Stoermeldungen mit Prioritaet 1 (sehr hoch) automatisch
  SELECT SINGLE qmart priok FROM qmel INTO (lv_qmart, lv_priok)
    WHERE qmnum = lv_qmnum.
  IF sy-subrc <> 0 OR lv_qmart <> 'M2' OR lv_priok <> '1'.
    RETURN.
  ENDIF.

  CREATE OBJECT lo_proc.
  TRY.
      lv_text = lo_proc->process( lv_qmnum ).
    CATCH zcx_pm_breakdown INTO lx_err.
      lv_text = lx_err->get_text( ).
      IF lv_text CS 'gesperrt'.
*       Ereignis spaeter erneut zustellen lassen
        RAISE temp_error.
      ENDIF.
      RAISE any_error.
  ENDTRY.

ENDFUNCTION.
