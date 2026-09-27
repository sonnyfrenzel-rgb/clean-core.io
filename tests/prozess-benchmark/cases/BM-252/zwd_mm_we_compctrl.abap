*----------------------------------------------------------------------*
* WD-Komponente ZWD_MM_WARENEINGANG, COMPONENTCONTROLLER
* Assistenzklasse: ZCL_MM_WE_ASSIST (wd_assist)
*----------------------------------------------------------------------*
METHOD lade_bestellung .
* IMPORTING iv_ebeln TYPE ebeln
  DATA: ls_header  TYPE bapimepoheader,
        lt_item    TYPE STANDARD TABLE OF bapimepoitem,
        lt_return  TYPE STANDARD TABLE OF bapiret2,
        lt_pos     TYPE wd_this->elements_positionen,
        lv_offen   TYPE bstmg,
        lo_msg     TYPE REF TO if_wd_message_manager.

  lo_msg = wd_this->wd_get_api( )->get_message_manager( ).

  TRY.
      wd_assist->pruefe_bestellung( iv_ebeln ).
    CATCH zcx_mm_we INTO DATA(lx_we).
      lo_msg->report_exception( message_object = lx_we ).
      RETURN.
  ENDTRY.

  CALL FUNCTION 'BAPI_PO_GETDETAIL1'
    EXPORTING
      purchaseorder = iv_ebeln
    IMPORTING
      poheader      = ls_header
    TABLES
      poitem        = lt_item
      return        = lt_return.

  LOOP AT lt_item INTO DATA(ls_item) WHERE delete_ind IS INITIAL.
*   Position ohne WE-Kennzeichen (z.B. Dienstleistung) nicht anbieten
    IF ls_item-gr_ind = abap_false.
      CONTINUE.
    ENDIF.

    lv_offen = ls_item-quantity - wd_assist->bereits_geliefert( iv_ebeln = iv_ebeln
                                                               iv_ebelp = ls_item-po_item ).
    IF lv_offen > 0.
      APPEND VALUE #( ebeln    = iv_ebeln
                      ebelp    = ls_item-po_item
                      matnr    = ls_item-material_long
                      werks    = ls_item-plant
                      lgort    = ls_item-stge_loc
                      offen    = lv_offen
                      meins    = ls_item-po_unit
                      erfmenge = lv_offen ) TO lt_pos.
    ENDIF.
  ENDLOOP.

  IF lt_pos IS INITIAL.
    lo_msg->report_t100_message( msgid = 'ZMM_WE' msgno = '010' msgty = 'I' p1 = iv_ebeln ).
  ENDIF.

  wd_context->get_child_node( name = wd_this->wdctx_positionen )->bind_table( new_items = lt_pos ).
  wd_context->get_child_node( name = wd_this->wdctx_kopf )->get_element( )->set_attribute(
    name = `LIEFERANT` value = ls_header-vendor ).
ENDMETHOD.


METHOD buchen .
* IMPORTING it_pos TYPE wd_this->elements_positionen
* RETURNING VALUE(rv_mblnr) TYPE mblnr
  DATA: ls_head    TYPE bapi2017_gm_head_01,
        lt_item    TYPE STANDARD TABLE OF bapi2017_gm_item_create,
        lt_return  TYPE STANDARD TABLE OF bapiret2,
        ls_head_r  TYPE bapi2017_gm_head_ret,
        lo_msg     TYPE REF TO if_wd_message_manager.

  lo_msg = wd_this->wd_get_api( )->get_message_manager( ).

  ls_head = VALUE #( pstng_date = sy-datum
                     doc_date   = sy-datum
                     pr_uname   = sy-uname
                     header_txt = 'WE Web Dynpro' ).

  lt_item = VALUE #( FOR ls_pos IN it_pos
                     ( po_number  = ls_pos-ebeln
                       po_item    = ls_pos-ebelp
                       material_long = ls_pos-matnr
                       plant      = ls_pos-werks
                       stge_loc   = ls_pos-lgort
                       entry_qnt  = ls_pos-erfmenge
                       entry_uom  = ls_pos-meins
                       move_type  = '101'
                       mvt_ind    = 'B' ) ).

  CALL FUNCTION 'BAPI_GOODSMVT_CREATE'
    EXPORTING
      goodsmvt_header  = ls_head
      goodsmvt_code    = VALUE bapi2017_gm_code( gm_code = '01' )
    IMPORTING
      goodsmvt_headret = ls_head_r
    TABLES
      goodsmvt_item    = lt_item
      return           = lt_return.

  IF ls_head_r-mat_doc IS INITIAL.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    LOOP AT lt_return INTO DATA(ls_ret) WHERE type CA 'EA'.
      lo_msg->report_t100_message( msgid = ls_ret-id msgno = ls_ret-number msgty = 'E'
                                   p1 = ls_ret-message_v1 p2 = ls_ret-message_v2
                                   p3 = ls_ret-message_v3 p4 = ls_ret-message_v4 ).
    ENDLOOP.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.
  rv_mblnr = ls_head_r-mat_doc.
ENDMETHOD.
