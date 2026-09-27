FUNCTION z_mm_umbuchung_upd.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein:
*"
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IT_INS) TYPE  ZCL_MM_UMBUCHUNG_BUFFER=>TT_UMB
*"     VALUE(IT_UPD) TYPE  ZCL_MM_UMBUCHUNG_BUFFER=>TT_UMB
*"----------------------------------------------------------------------

  IF it_ins IS NOT INITIAL.
    INSERT zmm_umbuchung FROM TABLE it_ins.
    IF sy-subrc <> 0.
      MESSAGE a050(zmm_umb).         "Umbuchung konnte nicht angelegt werden
    ENDIF.
  ENDIF.

  IF it_upd IS NOT INITIAL.
    UPDATE zmm_umbuchung FROM TABLE it_upd.
    IF sy-subrc <> 0.
      MESSAGE a051(zmm_umb).
    ENDIF.
  ENDIF.

ENDFUNCTION.
