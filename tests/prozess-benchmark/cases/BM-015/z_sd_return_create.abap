FUNCTION z_sd_return_create.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_FAKTURA) TYPE  VBELN_VF
*"     VALUE(IV_AUGRU) TYPE  AUGRU
*"     VALUE(IT_ITEMS) TYPE  ZSD_T_RET_ITEM
*"     VALUE(IV_SIMULATE) TYPE  XFELD DEFAULT SPACE
*"  EXPORTING
*"     VALUE(EV_RETOURE) TYPE  VBELN_VA
*"     VALUE(ET_RETURN) TYPE  BAPIRET2_T
*"----------------------------------------------------------------------
* Retourenauftrag mit Bezug zur Faktura anlegen (Retourenportal / RFC)
* 2017-05 CSC  Ersterstellung
* 2019-08 CSC  Kulanzretoure (Auftragsgrund Z05) auch nach 365 Tagen
*----------------------------------------------------------------------
  CLEAR: ev_retoure, et_return, gs_vbrk, gt_vbrp.

  AUTHORITY-CHECK OBJECT 'V_VBAK_AAT'
    ID 'AUART' FIELD gc_auart_retoure
    ID 'ACTVT' FIELD '01'.
  IF sy-subrc <> 0.
    PERFORM fehler USING '500' gc_auart_retoure space CHANGING et_return.
    RETURN.
  ENDIF.

  PERFORM faktura_pruefen USING iv_faktura iv_augru CHANGING et_return.
  IF et_return IS NOT INITIAL.
    RETURN.
  ENDIF.

  PERFORM mengen_pruefen USING it_items CHANGING et_return.
  IF et_return IS NOT INITIAL.
    RETURN.
  ENDIF.

  PERFORM retoure_anlegen USING it_items iv_augru iv_simulate
                          CHANGING ev_retoure et_return.
ENDFUNCTION.
