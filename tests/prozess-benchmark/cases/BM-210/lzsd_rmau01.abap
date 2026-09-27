FUNCTION z_sd_rma_create.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_FKBEL) TYPE  VBELN_VF
*"     VALUE(IT_ITEMS) TYPE  ZSD_RMA_ITEM_T
*"     VALUE(IV_SIMULATE) TYPE  ABAP_BOOL DEFAULT ABAP_FALSE
*"  EXPORTING
*"     VALUE(EV_VBELN) TYPE  VBELN_VA
*"     VALUE(ET_RETURN) TYPE  BAPIRET2_T
*"----------------------------------------------------------------------
  DATA: lo_chain    TYPE REF TO lcl_validator_chain,
        lx_rej      TYPE REF TO lcx_rma_rejected,
        ls_item     TYPE ty_rma_item,
        ls_header   TYPE bapisdhd1,
        lt_partner  TYPE STANDARD TABLE OF bapiparnr,
        lt_ret      TYPE STANDARD TABLE OF bapiret2,
        lv_rejected TYPE abap_bool.

  CLEAR: gt_return, ev_vbeln.

* Portal-Benutzer braucht Anlageberechtigung fuer Retouren
  AUTHORITY-CHECK OBJECT 'V_VBAK_AAT'
    ID 'AUART' FIELD gc_auart
    ID 'ACTVT' FIELD '01'.
  IF sy-subrc <> 0.
    PERFORM add_message USING 'E' 'Keine Berechtigung fuer Retourenanlage'.
    et_return = gt_return.
    RETURN.
  ENDIF.

  SELECT SINGLE * FROM vbrk INTO gs_vbrk
    WHERE vbeln = iv_fkbel.
  IF sy-subrc <> 0.
    PERFORM add_message USING 'E' 'Rechnung nicht gefunden'.
    et_return = gt_return.
    RETURN.
  ENDIF.

  lo_chain = lcl_validator_chain=>build( gs_vbrk-vkorg ).

  LOOP AT it_items INTO ls_item.
    TRY.
        lo_chain->validate( is_vbrk = gs_vbrk
                            is_item = ls_item ).
      CATCH lcx_rma_rejected INTO lx_rej.
        PERFORM add_message USING 'E' lx_rej->mv_reason.
        lv_rejected = abap_true.
    ENDTRY.
  ENDLOOP.

  IF lv_rejected = abap_true.
    et_return = gt_return.
    RETURN.
  ENDIF.

  IF iv_simulate = abap_true.
    PERFORM add_message USING 'S' 'Retoure zulaessig (Simulation)'.
    et_return = gt_return.
    RETURN.
  ENDIF.

  PERFORM build_bapi_items USING gs_vbrk it_items.

  ls_header-doc_type   = gc_auart.
  ls_header-sales_org  = gs_vbrk-vkorg.
  ls_header-distr_chan = gs_vbrk-vtweg.
  ls_header-division   = gs_vbrk-spart.
  ls_header-ref_doc    = gs_vbrk-vbeln.
  ls_header-refdoc_cat = 'M'.
  APPEND VALUE #( partn_role = 'AG' partn_numb = gs_vbrk-kunag ) TO lt_partner.

  CALL FUNCTION 'BAPI_CUSTOMERRETURN_CREATE'
    EXPORTING
      return_header_in = ls_header
    IMPORTING
      salesdocument    = ev_vbeln
    TABLES
      return           = lt_ret
      return_items_in  = gt_bapi_items
      return_partners  = lt_partner.

  APPEND LINES OF lt_ret TO gt_return.
  IF ev_vbeln IS INITIAL.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
  ENDIF.
  et_return = gt_return.
ENDFUNCTION.
