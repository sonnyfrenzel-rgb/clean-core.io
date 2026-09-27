REPORT zmm_banf_to_po.
*----------------------------------------------------------------------*
* Bestellanforderungen mit festem Lieferanten automatisch in
* Bestellungen umsetzen (ein Beleg je Lieferant/Einkaufsorg.)
* 2012-05 JS  Erstellung
* 2015-11 TK  Testlauf ergaenzt
*----------------------------------------------------------------------*
PARAMETERS: p_werks TYPE eban-werks OBLIGATORY,
            p_ekorg TYPE eban-ekorg OBLIGATORY,
            p_bsart TYPE ekko-bsart DEFAULT 'NB',
            p_frgkz TYPE eban-frgkz DEFAULT '2',
            p_test  AS CHECKBOX DEFAULT 'X'.

DATA: gt_eban   TYPE STANDARD TABLE OF eban,
      gs_eban   TYPE eban,
      gt_lifnr  TYPE SORTED TABLE OF lifnr WITH UNIQUE KEY table_line,
      gv_lifnr  TYPE lifnr,
      gs_header TYPE bapimepoheader,
      gs_headx  TYPE bapimepoheaderx,
      gt_item   TYPE STANDARD TABLE OF bapimepoitem,
      gs_item   TYPE bapimepoitem,
      gt_itemx  TYPE STANDARD TABLE OF bapimepoitemx,
      gs_itemx  TYPE bapimepoitemx,
      gt_return TYPE STANDARD TABLE OF bapiret2,
      gv_ebeln  TYPE ebeln,
      gv_ebelp  TYPE ebelp.

START-OF-SELECTION.
  SELECT * FROM eban INTO TABLE gt_eban
    WHERE werks = p_werks
      AND ekorg = p_ekorg
      AND frgkz = p_frgkz
      AND statu = 'N'
      AND loekz = space
      AND flief <> space.
  IF gt_eban IS INITIAL.
    MESSAGE s001(zmm) WITH 'Keine offenen Banfen'.
    LEAVE LIST-PROCESSING.
  ENDIF.

  LOOP AT gt_eban INTO gs_eban.
    INSERT gs_eban-flief INTO TABLE gt_lifnr.
  ENDLOOP.

  LOOP AT gt_lifnr INTO gv_lifnr.
    CLEAR: gs_header, gs_headx, gt_item, gt_itemx, gt_return, gv_ebeln, gv_ebelp.
    gs_header-comp_code = '1000'.            "TODO: aus T001W/T001K lesen
    gs_header-doc_type  = p_bsart.
    gs_header-vendor    = gv_lifnr.
    gs_header-purch_org = p_ekorg.
    gs_header-pur_group = '001'.
    gs_headx-comp_code = gs_headx-doc_type = gs_headx-vendor = 'X'.
    gs_headx-purch_org = gs_headx-pur_group = 'X'.

    LOOP AT gt_eban INTO gs_eban WHERE flief = gv_lifnr.
      gv_ebelp = gv_ebelp + 10.
      gs_item-po_item    = gv_ebelp.
      gs_item-preq_no    = gs_eban-banfn.
      gs_item-preq_item  = gs_eban-bnfpo.
      gs_item-quantity   = gs_eban-menge.
      APPEND gs_item TO gt_item.
      gs_itemx-po_item   = gv_ebelp.
      gs_itemx-preq_no = gs_itemx-preq_item = gs_itemx-quantity = 'X'.
      APPEND gs_itemx TO gt_itemx.
    ENDLOOP.

    CALL FUNCTION 'BAPI_PO_CREATE1'
      EXPORTING
        poheader         = gs_header
        poheaderx        = gs_headx
        testrun          = p_test
      IMPORTING
        exppurchaseorder = gv_ebeln
      TABLES
        return           = gt_return
        poitem           = gt_item
        poitemx          = gt_itemx.

    READ TABLE gt_return TRANSPORTING NO FIELDS
      WITH KEY type = 'E'.
    IF sy-subrc = 0.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      WRITE: / gv_lifnr, 'Fehler - keine Bestellung angelegt'.
      CONTINUE.
    ENDIF.

    IF p_test = 'X'.
      WRITE: / gv_lifnr, 'Testlauf ok,', lines( gt_item ), 'Positionen'.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = 'X'.
      WRITE: / gv_lifnr, 'Bestellung', gv_ebeln, 'angelegt'.
    ENDIF.
  ENDLOOP.
