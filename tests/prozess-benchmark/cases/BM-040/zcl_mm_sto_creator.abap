*----------------------------------------------------------------------*
* Anlage Umlagerungsbestellung, Auslieferung und Warenausgang
*----------------------------------------------------------------------*
CLASS zcl_mm_sto_creator DEFINITION
  PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING iv_test TYPE abap_bool.
    METHODS create_sto
      IMPORTING is_route        TYPE zmm_sto_route
                it_need         TYPE zmm_t_sto_need
      RETURNING VALUE(rv_ebeln) TYPE ebeln.
    METHODS create_delivery
      IMPORTING iv_ebeln        TYPE ebeln
                iv_vstel        TYPE vstel
      RETURNING VALUE(rv_vbeln) TYPE vbeln_vl.
    METHODS post_goods_issue
      IMPORTING iv_vbeln     TYPE vbeln_vl
      RETURNING VALUE(rv_ok) TYPE abap_bool.
    METHODS last_error
      RETURNING VALUE(rv_text) TYPE bapi_msg.
  PRIVATE SECTION.
    DATA: mv_test  TYPE abap_bool,
          mv_error TYPE bapi_msg.
    METHODS first_error
      IMPORTING it_return      TYPE bapiret2_t
      RETURNING VALUE(rv_error) TYPE abap_bool.
ENDCLASS.

CLASS zcl_mm_sto_creator IMPLEMENTATION.

  METHOD constructor.
    mv_test = iv_test.
  ENDMETHOD.

  METHOD create_sto.
    DATA: ls_head   TYPE bapimepoheader,
          ls_headx  TYPE bapimepoheaderx,
          lt_item   TYPE STANDARD TABLE OF bapimepoitem,
          lt_itemx  TYPE STANDARD TABLE OF bapimepoitemx,
          lt_return TYPE bapiret2_t,
          lv_ebelp  TYPE ebelp.

    ls_head = VALUE #( doc_type   = is_route-bsart
                       purch_org  = is_route-ekorg
                       pur_group  = is_route-ekgrp
                       comp_code  = is_route-bukrs
                       suppl_plnt = is_route-reswk
                       doc_date   = sy-datum ).
    ls_headx = VALUE #( doc_type = 'X' purch_org = 'X' pur_group = 'X'
                        comp_code = 'X' suppl_plnt = 'X' doc_date = 'X' ).
    LOOP AT it_need INTO DATA(ls_need).
      lv_ebelp = lv_ebelp + 10.
      APPEND VALUE #( po_item = lv_ebelp material = ls_need-matnr plant = is_route-werks
                      stge_loc = is_route-lgort quantity = ls_need-menge po_unit = ls_need-meins )
        TO lt_item.
      APPEND VALUE #( po_item = lv_ebelp material = 'X' plant = 'X' stge_loc = 'X'
                      quantity = 'X' po_unit = 'X' ) TO lt_itemx.
    ENDLOOP.

    CALL FUNCTION 'BAPI_PO_CREATE1'
      EXPORTING
        poheader         = ls_head
        poheaderx        = ls_headx
        testrun          = mv_test
      IMPORTING
        exppurchaseorder = rv_ebeln
      TABLES
        return           = lt_return
        poitem           = lt_item
        poitemx          = lt_itemx.

    IF first_error( lt_return ) = abap_true.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      CLEAR rv_ebeln.
      RETURN.
    ENDIF.
    IF mv_test = abap_true.
      rv_ebeln = 'TEST'.
      RETURN.
    ENDIF.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
  ENDMETHOD.

  METHOD create_delivery.
    DATA: lt_items  TYPE STANDARD TABLE OF bapidlvreftosto,
          lt_return TYPE bapiret2_t.

    SELECT ebelp FROM ekpo INTO TABLE @DATA(lt_ebelp)
      WHERE ebeln = @iv_ebeln
      ORDER BY ebelp.
    lt_items = VALUE #( FOR ls_p IN lt_ebelp ( ref_doc = iv_ebeln ref_item = ls_p-ebelp ) ).

    CALL FUNCTION 'BAPI_OUTB_DELIVERY_CREATE_STO'
      EXPORTING
        ship_point        = iv_vstel
      IMPORTING
        delivery          = rv_vbeln
      TABLES
        stock_trans_items = lt_items
        return            = lt_return.

    IF first_error( lt_return ) = abap_true OR rv_vbeln IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      CLEAR rv_vbeln.
      RETURN.
    ENDIF.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
  ENDMETHOD.

  METHOD post_goods_issue.
    DATA: ls_vbkok TYPE vbkok,
          lv_error TYPE xfeld,
          lt_prot  TYPE STANDARD TABLE OF prott.

    ls_vbkok-vbeln_vl = iv_vbeln.
    ls_vbkok-wabuc    = abap_true.
    ls_vbkok-wadat_ist = sy-datum.

    CALL FUNCTION 'WS_DELIVERY_UPDATE'
      EXPORTING
        vbkok_wa         = ls_vbkok
        commit           = abap_true
        delivery         = iv_vbeln
      IMPORTING
        ef_error_any_0   = lv_error
      TABLES
        prot             = lt_prot.
    IF lv_error = abap_true.
      READ TABLE lt_prot INTO DATA(ls_prot) INDEX 1.
      MESSAGE ID ls_prot-msgid TYPE 'E' NUMBER ls_prot-msgno
        WITH ls_prot-msgv1 ls_prot-msgv2 ls_prot-msgv3 ls_prot-msgv4
        INTO mv_error.
      rv_ok = abap_false.
    ELSE.
      rv_ok = abap_true.
    ENDIF.
  ENDMETHOD.

  METHOD last_error.
    rv_text = mv_error.
  ENDMETHOD.

  METHOD first_error.
    LOOP AT it_return INTO DATA(ls_ret) WHERE type CA 'EA'.
      mv_error = ls_ret-message.
      rv_error = abap_true.
      RETURN.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
