FUNCTION z_sd_create_delivery.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_VBELN) TYPE  VBELN_VA
*"     VALUE(IV_VSTEL) TYPE  VSTEL
*"     VALUE(IV_DUE_DATE) TYPE  DATUM DEFAULT SY-DATUM
*"     VALUE(IV_TESTRUN) TYPE  XFELD DEFAULT SPACE
*"  EXPORTING
*"     VALUE(EV_DELIVERY) TYPE  VBELN_VL
*"     VALUE(EV_NUM_DELIV) TYPE  I
*"  TABLES
*"      ET_RETURN STRUCTURE  BAPIRET2
*"----------------------------------------------------------------------
* Lieferung zum Kundenauftrag anlegen (aufgerufen aus Leitstand und
* aus dem Job ZSD_DELIV_NIGHT). 2016-04 JBE
  TYPES: BEGIN OF lty_pos,
           posnr  TYPE vbap-posnr,
           kwmeng TYPE vbap-kwmeng,
           vrkme  TYPE vbap-vrkme,
         END OF lty_pos.
  DATA: lt_pos     TYPE STANDARD TABLE OF lty_pos,
        lt_items   TYPE STANDARD TABLE OF bapidlvreftosalesorder,
        lt_created TYPE STANDARD TABLE OF bapidlvitemcreated,
        lv_lifsk   TYPE vbak-lifsk,
        lv_cmgst   TYPE vbuk-cmgst.

  SELECT SINGLE lifsk FROM vbak INTO lv_lifsk WHERE vbeln = iv_vbeln.
  IF sy-subrc <> 0.
    APPEND VALUE #( type = 'E' id = 'ZSD' number = '301'
                    message_v1 = iv_vbeln ) TO et_return.
    RETURN.
  ENDIF.
  IF lv_lifsk IS NOT INITIAL.
    APPEND VALUE #( type = 'E' id = 'ZSD' number = '302'
                    message_v1 = iv_vbeln message_v2 = lv_lifsk ) TO et_return.
    RETURN.
  ENDIF.

* Kreditstatus: B = nicht ok, C = teilweise freigegeben -> keine Lieferung
  SELECT SINGLE cmgst FROM vbuk INTO lv_cmgst WHERE vbeln = iv_vbeln.
  IF lv_cmgst = 'B' OR lv_cmgst = 'C'.
    APPEND VALUE #( type = 'E' id = 'ZSD' number = '303'
                    message_v1 = iv_vbeln ) TO et_return.
    RETURN.
  ENDIF.

  SELECT posnr kwmeng vrkme FROM vbap INTO TABLE lt_pos
    WHERE vbeln = iv_vbeln
      AND abgru = space.
  IF lt_pos IS INITIAL.
    APPEND VALUE #( type = 'W' id = 'ZSD' number = '304'
                    message_v1 = iv_vbeln ) TO et_return.
    RETURN.
  ENDIF.

  lt_items = VALUE #( FOR ls_pos IN lt_pos
                      ( ref_doc    = iv_vbeln
                        ref_item   = ls_pos-posnr
                        dlv_qty    = ls_pos-kwmeng
                        sales_unit = ls_pos-vrkme ) ).

  CALL FUNCTION 'BAPI_OUTB_DELIVERY_CREATE_SLS'
    EXPORTING
      ship_point        = iv_vstel
      due_date          = iv_due_date
    IMPORTING
      delivery          = ev_delivery
      num_deliveries    = ev_num_deliv
    TABLES
      sales_order_items = lt_items
      created_items     = lt_created
      return            = et_return.

  READ TABLE et_return TRANSPORTING NO FIELDS WITH KEY type = 'E'.
  IF sy-subrc = 0 OR iv_testrun = abap_true.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    CLEAR: ev_delivery, ev_num_deliv.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
  ENDIF.
ENDFUNCTION.
