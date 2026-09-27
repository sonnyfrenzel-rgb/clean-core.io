FUNCTION z_mm_sto_create_rfc.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:  (RFC-faehig, Funktionsgruppe ZMM_STO)
*"  IMPORTING
*"     VALUE(IV_WERKS) TYPE  WERKS_D
*"     VALUE(IV_SUPPLY) TYPE  RESWK
*"     VALUE(IT_ITEMS) TYPE  ZMM_STO_ITEM_T
*"  EXPORTING
*"     VALUE(EV_EBELN) TYPE  EBELN
*"     VALUE(ET_RETURN) TYPE  BAPIRET2_T
*"----------------------------------------------------------------------
  DATA: ls_head  TYPE bapimepoheader,
        ls_headx TYPE bapimepoheaderx,
        lt_item  TYPE STANDARD TABLE OF bapimepoitem,
        lt_itemx TYPE STANDARD TABLE OF bapimepoitemx.

* Umlagerungsbestellung UB, Lieferwerk = Zentrallager
  ls_head  = VALUE #( comp_code = '1000' doc_type = 'UB' purch_org = '1000'
                      pur_group = 'N01' suppl_plnt = iv_supply ).
  ls_headx = VALUE #( comp_code = 'X' doc_type = 'X' purch_org = 'X'
                      pur_group = 'X' suppl_plnt = 'X' ).
  lt_item  = VALUE #( FOR i IN it_items INDEX INTO idx
                      ( po_item = idx * 10 material = i-matnr plant = iv_werks
                        quantity = i-menge po_unit = i-meins ) ).
  lt_itemx = VALUE #( FOR i IN it_items INDEX INTO idx
                      ( po_item = idx * 10 po_itemx = 'X' material = 'X'
                        plant = 'X' quantity = 'X' po_unit = 'X' ) ).

  CALL FUNCTION 'BAPI_PO_CREATE1'
    EXPORTING
      poheader         = ls_head
      poheaderx        = ls_headx
    IMPORTING
      exppurchaseorder = ev_ebeln
    TABLES
      return           = et_return
      poitem           = lt_item
      poitemx          = lt_itemx.

  IF ev_ebeln IS INITIAL.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
  ENDIF.
ENDFUNCTION.
