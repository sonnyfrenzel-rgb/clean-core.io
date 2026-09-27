CLASS zcl_mm_gr_in DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES zii_mm_goods_receipt_in.
  PROTECTED SECTION.
  PRIVATE SECTION.
    CONSTANTS gc_mvt_gr TYPE bwart VALUE '101'.
ENDCLASS.



CLASS zcl_mm_gr_in IMPLEMENTATION.

  METHOD zii_mm_goods_receipt_in~goods_receipt_in.
*   Inbound-Proxy: Wareneingangsmeldung vom externen Lager (LVS-Dienstleister)
*   Mapping 1:1 auf BAPI_GOODSMVT_CREATE, GM-Code 01 (WE zur Bestellung)
    DATA: ls_header  TYPE bapi2017_gm_head_01,
          ls_code    TYPE bapi2017_gm_code,
          lt_item    TYPE STANDARD TABLE OF bapi2017_gm_item_create,
          ls_item    TYPE bapi2017_gm_item_create,
          lt_return  TYPE STANDARD TABLE OF bapiret2,
          ls_return  TYPE bapiret2,
          lv_mblnr   TYPE mblnr,
          lv_mjahr   TYPE mjahr,
          ls_log     TYPE zmm_gr_msglog.

    DATA(lv_msgid) = input-goods_receipt-message_id.

*   Doppelte Nachricht? Dann nur quittieren
    SELECT SINGLE mblnr mjahr FROM zmm_gr_msglog
      INTO (lv_mblnr, lv_mjahr)
      WHERE msgid = lv_msgid.
    IF sy-subrc = 0.
      output-goods_receipt_confirmation-material_document = lv_mblnr.
      output-goods_receipt_confirmation-status = 'DUPLICATE'.
      RETURN.
    ENDIF.

    SELECT SINGLE ebeln FROM ekko INTO @DATA(lv_ebeln)
      WHERE ebeln = @input-goods_receipt-purchase_order
        AND loekz = @space.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_mm_gr_fault
        EXPORTING
          standard = VALUE #( fault_text = |Bestellung { input-goods_receipt-purchase_order } unbekannt| ).
    ENDIF.

    ls_header-pstng_date = input-goods_receipt-posting_date.
    ls_header-doc_date   = sy-datum.
    ls_header-ref_doc_no = input-goods_receipt-delivery_note.
    ls_code-gm_code      = '01'.

    LOOP AT input-goods_receipt-item INTO DATA(ls_in).
      IF ls_in-quantity <= 0.
        CONTINUE.
      ENDIF.
      CLEAR ls_item.
      ls_item-po_number  = lv_ebeln.
      ls_item-po_item    = ls_in-po_item.
      ls_item-move_type  = gc_mvt_gr.
      ls_item-mvt_ind    = 'B'.
      ls_item-entry_qnt  = ls_in-quantity.
      ls_item-plant      = ls_in-plant.
      ls_item-stge_loc   = ls_in-storage_location.
*     ls_item-batch      = ls_in-batch.   "Charge erst ab Welle 2
      APPEND ls_item TO lt_item.
    ENDLOOP.

    CALL FUNCTION 'BAPI_GOODSMVT_CREATE'
      EXPORTING
        goodsmvt_header  = ls_header
        goodsmvt_code    = ls_code
      IMPORTING
        materialdocument = lv_mblnr
        matdocumentyear  = lv_mjahr
      TABLES
        goodsmvt_item    = lt_item
        return           = lt_return.

    LOOP AT lt_return INTO ls_return WHERE type CA 'EAX'.
      EXIT.
    ENDLOOP.
    IF sy-subrc = 0.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      RAISE EXCEPTION TYPE zcx_mm_gr_fault
        EXPORTING
          standard = VALUE #( fault_text = ls_return-message ).
    ENDIF.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.

    ls_log-msgid = lv_msgid.
    ls_log-mblnr = lv_mblnr.
    ls_log-mjahr = lv_mjahr.
    ls_log-erdat = sy-datum.
    INSERT zmm_gr_msglog FROM ls_log.

    output-goods_receipt_confirmation-material_document = lv_mblnr.
    output-goods_receipt_confirmation-status = 'POSTED'.
  ENDMETHOD.

ENDCLASS.
