*----------------------------------------------------------------------*
* Include LZSD_RMAF01 - Hilfsroutinen
*----------------------------------------------------------------------*
FORM add_message USING iv_type TYPE bapi_mtype
                       iv_text TYPE csequence.
  APPEND VALUE #( type = iv_type id = 'ZSD_RMA' number = '000'
                  message = iv_text ) TO gt_return.
ENDFORM.

FORM build_bapi_items USING is_vbrk  TYPE vbrk
                            it_items TYPE tt_rma_item.
  DATA: ls_item TYPE ty_rma_item,
        ls_bapi TYPE bapisditm,
        lv_posn TYPE posnr_va.

  CLEAR gt_bapi_items.
  LOOP AT it_items INTO ls_item.
    lv_posn = lv_posn + 10.
    CLEAR ls_bapi.
    ls_bapi-itm_number = lv_posn.
    ls_bapi-material   = ls_item-matnr.
    ls_bapi-target_qty = ls_item-menge.
    ls_bapi-reason_rej = space.
*   Referenzposition der Rechnung zum Material
    SELECT SINGLE posnr FROM vbrp INTO ls_bapi-ref_doc_it
      WHERE vbeln = is_vbrk-vbeln
        AND matnr = ls_item-matnr.
    IF sy-subrc = 0.
      ls_bapi-ref_doc    = is_vbrk-vbeln.
      ls_bapi-ref_doc_ca = 'M'.
    ENDIF.
    APPEND ls_bapi TO gt_bapi_items.
  ENDLOOP.
ENDFORM.
