FUNCTION exit_saplkedrcopa_001.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(I_OPERATING_CONCERN) LIKE  TKEB-ERKRS
*"     VALUE(I_DERIVATION_DATE) LIKE  SY-DATUM
*"     VALUE(I_STEP_ID) LIKE  TKEDRS-STEPID
*"     VALUE(I_COPA_ITEM)
*"     VALUE(I_GLOBAL) LIKE  KEDRCOPA STRUCTURE  KEDRCOPA
*"  EXPORTING
*"     REFERENCE(E_COPA_ITEM)
*"     VALUE(E_EXIT_IS_ACTIVE)
*"     VALUE(E_FAILED)
*"----------------------------------------------------------------------

  INCLUDE zxkkeu11.

ENDFUNCTION.
