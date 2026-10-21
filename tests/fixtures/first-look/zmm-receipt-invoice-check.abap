*&---------------------------------------------------------------------*
*& Report ZMM_RECEIPT_INVOICE_CHECK
*&---------------------------------------------------------------------*
*& Synthetic test fixture (Clean-Core.io 3.0.20). Same shape as an owner's
*& program: a three-way check of supplier invoices against purchase orders
*& and goods receipts, with a built-in demo-case switch for trying it out.
*&---------------------------------------------------------------------*
REPORT zmm_receipt_invoice_check.

TYPES: BEGIN OF ty_docline,
         invoice      TYPE c LENGTH 10,
         po_number    TYPE c LENGTH 10,
         po_item      TYPE c LENGTH 5,
         quantity     TYPE i,
         po_amount    TYPE p LENGTH 15 DECIMALS 2,
         inv_amount   TYPE p LENGTH 15 DECIMALS 2,
         kind         TYPE c LENGTH 3,
         reversed     TYPE abap_bool,
         status       TYPE c LENGTH 20,
         code         TYPE c LENGTH 4,
         amount_known TYPE abap_bool,
       END OF ty_docline.
TYPES: BEGIN OF ty_snapshot,
         taken_on TYPE d,
         complete TYPE abap_bool,
       END OF ty_snapshot.

CONSTANTS: gc_status_rejected TYPE c LENGTH 20 VALUE 'INPUT_REJECTED',
           gc_status_matched  TYPE c LENGTH 20 VALUE 'MATCHED',
           gc_status_blocked  TYPE c LENGTH 20 VALUE 'BLOCKED_FOR_PAYMENT',
           gc_kind_reversal   TYPE c LENGTH 3 VALUE 'REV',
           gc_max_raw         TYPE i VALUE 1000000000,
           gc_max_scaled      TYPE p LENGTH 16 DECIMALS 0 VALUE 1000000000000.

DATA: gt_doclines   TYPE STANDARD TABLE OF ty_docline WITH DEFAULT KEY,
      gs_docline    TYPE ty_docline,
      gs_snapshot   TYPE ty_snapshot,
      gv_code       TYPE c LENGTH 4,
      gv_failed     TYPE abap_bool,
      gt_csv        TYPE STANDARD TABLE OF string WITH DEFAULT KEY,
      gt_return     TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY,
      gs_po_header  TYPE bapimepoheader,
      gt_po_items   TYPE STANDARD TABLE OF bapimepoitem WITH DEFAULT KEY,
      gs_inv_header TYPE bapi_incinv_detail_header,
      gt_inv_items  TYPE STANDARD TABLE OF bapi_incinv_detail_item WITH DEFAULT KEY,
      gt_receipts   TYPE STANDARD TABLE OF bapi2017_gm_item_show WITH DEFAULT KEY.

PARAMETERS: p_doc  TYPE c LENGTH 10,
            p_year TYPE n LENGTH 4,
            p_tol  TYPE p LENGTH 5 DECIMALS 2 DEFAULT '2.00',
            p_dec  TYPE i DEFAULT 2,
            p_det  AS CHECKBOX DEFAULT space,
            p_list AS CHECKBOX DEFAULT 'X',
            p_csv  AS CHECKBOX DEFAULT space,
            p_demo AS CHECKBOX DEFAULT space,
            p_case TYPE i DEFAULT 0.

START-OF-SELECTION.
  PERFORM apply_case.
  PERFORM evaluate.
  PERFORM show_results.
  IF p_csv = abap_true AND sy-batch = abap_false.
    PERFORM download_csv.
  ENDIF.

*----------------------------------------------------------------------*
* Demo data: one case per number, for trying the check out.
*----------------------------------------------------------------------*
FORM apply_case.
  IF p_demo = abap_false.
    RETURN.
  ENDIF.
  IF p_case < 0 OR p_case > 31.
    MESSAGE 'Supported demo cases are 0 through 31' TYPE 'E'.
  ENDIF.
  CLEAR gt_doclines.
  gs_snapshot-taken_on = sy-datum.
  gs_snapshot-complete = abap_true.
  CASE p_case.
    WHEN 1.
      PERFORM add_docline USING '5100000001' '4500000001' '10' 101 '107.00' '107.00' 'NEW'.
    WHEN 2.
      PERFORM add_docline USING '5100000002' '4500000002' '20' 52 '72.00' '97.50' 'NEW'.
      gs_snapshot-complete = abap_false.
    WHEN 3.
      PERFORM add_docline USING '5100000003' '4500000003' '30' 13 '59.00' '59.00' 'REV'.
    WHEN 4.
      PERFORM add_docline USING '5100000004' '4500000004' '10' 104 '128.00' '128.00' 'NEW'.
    WHEN 5.
      PERFORM add_docline USING '5100000005' '4500000005' '20' 55 '105.00' '130.50' 'NEW'.
      gs_snapshot-complete = abap_false.
    WHEN 6.
      PERFORM add_docline USING '5100000006' '4500000006' '30' 16 '98.00' '98.00' 'REV'.
    WHEN 7.
      PERFORM add_docline USING '5100000007' '4500000007' '10' 107 '149.00' '149.00' 'NEW'.
    WHEN 8.
      PERFORM add_docline USING '5100000008' '4500000008' '20' 58 '138.00' '163.50' 'NEW'.
      gs_snapshot-complete = abap_false.
    WHEN 9.
      PERFORM add_docline USING '5100000009' '4500000009' '30' 19 '137.00' '137.00' 'REV'.
    WHEN 10.
      PERFORM add_docline USING '5100000010' '4500000010' '10' 110 '170.00' '170.00' 'NEW'.
    WHEN 11.
      PERFORM add_docline USING '5100000011' '4500000011' '20' 61 '171.00' '196.50' 'NEW'.
      gs_snapshot-complete = abap_false.
    WHEN 12.
      PERFORM add_docline USING '5100000012' '4500000012' '30' 22 '176.00' '176.00' 'REV'.
    WHEN 13.
      PERFORM add_docline USING '5100000013' '4500000013' '10' 113 '191.00' '191.00' 'NEW'.
    WHEN 14.
      PERFORM add_docline USING '5100000014' '4500000014' '20' 64 '204.00' '229.50' 'NEW'.
      gs_snapshot-complete = abap_false.
    WHEN 15.
      PERFORM add_docline USING '5100000015' '4500000015' '30' 25 '215.00' '215.00' 'REV'.
    WHEN 16.
      PERFORM add_docline USING '5100000016' '4500000016' '10' 116 '212.00' '212.00' 'NEW'.
    WHEN 17.
      PERFORM add_docline USING '5100000017' '4500000017' '20' 67 '237.00' '262.50' 'NEW'.
      gs_snapshot-complete = abap_false.
    WHEN 18.
      PERFORM add_docline USING '5100000018' '4500000018' '30' 28 '254.00' '254.00' 'REV'.
    WHEN 19.
      PERFORM add_docline USING '5100000019' '4500000019' '10' 119 '233.00' '233.00' 'NEW'.
    WHEN 20.
      PERFORM add_docline USING '5100000020' '4500000020' '20' 70 '270.00' '295.50' 'NEW'.
      gs_snapshot-complete = abap_false.
    WHEN 21.
      PERFORM add_docline USING '5100000021' '4500000021' '30' 31 '293.00' '293.00' 'REV'.
    WHEN 22.
      PERFORM add_docline USING '5100000022' '4500000022' '10' 122 '254.00' '254.00' 'NEW'.
    WHEN 23.
      PERFORM add_docline USING '5100000023' '4500000023' '20' 73 '303.00' '328.50' 'NEW'.
      gs_snapshot-complete = abap_false.
    WHEN 24.
      PERFORM add_docline USING '5100000024' '4500000024' '30' 34 '332.00' '332.00' 'REV'.
    WHEN 25.
      PERFORM add_docline USING '5100000025' '4500000025' '10' 125 '275.00' '275.00' 'NEW'.
    WHEN 26.
      PERFORM add_docline USING '5100000026' '4500000026' '20' 76 '336.00' '361.50' 'NEW'.
      gs_snapshot-complete = abap_false.
    WHEN 27.
      PERFORM add_docline USING '5100000027' '4500000027' '30' 37 '371.00' '371.00' 'REV'.
    WHEN 28.
      PERFORM add_docline USING '5100000028' '4500000028' '10' 128 '296.00' '296.00' 'NEW'.
    WHEN 29.
      PERFORM add_docline USING '5100000029' '4500000029' '20' 79 '369.00' '394.50' 'NEW'.
      gs_snapshot-complete = abap_false.
    WHEN 30.
      PERFORM add_docline USING '5100000030' '4500000030' '30' 40 '410.00' '410.00' 'REV'.
    WHEN OTHERS.
      PERFORM add_docline USING '5100000000' '4500000000' '10' 1 '10.00' '10.00' 'NEW'.
  ENDCASE.
ENDFORM.

FORM add_docline USING iv_invoice TYPE c iv_po TYPE c iv_item TYPE c
                       iv_qty TYPE i iv_po_amount TYPE c iv_inv_amount TYPE c
                       iv_kind TYPE c.
  CLEAR gs_docline.
  gs_docline-invoice      = iv_invoice.
  gs_docline-po_number    = iv_po.
  gs_docline-po_item      = iv_item.
  gs_docline-quantity     = iv_qty.
  gs_docline-po_amount    = iv_po_amount.
  gs_docline-inv_amount   = iv_inv_amount.
  gs_docline-kind         = iv_kind.
  gs_docline-amount_known = abap_true.
  APPEND gs_docline TO gt_doclines.
ENDFORM.

*----------------------------------------------------------------------*
* Live data: the invoice, its purchase order and its goods receipts.
*----------------------------------------------------------------------*
FORM read_documents.
  IF p_doc IS INITIAL.
    MESSAGE 'Enter an invoice document' TYPE 'E'.
  ENDIF.
  CALL FUNCTION 'BAPI_INCOMINGINVOICE_GETDETAIL'
    EXPORTING
      invoicedocnumber = p_doc
      fiscalyear       = p_year
    IMPORTING
      headerdata       = gs_inv_header
    TABLES
      itemdata         = gt_inv_items
      return           = gt_return.
  IF sy-subrc <> 0 OR gt_inv_items IS INITIAL.
    gv_code = 'E001'.
    MESSAGE 'No invoice document found' TYPE 'I'.
    RETURN.
  ENDIF.
  LOOP AT gt_inv_items ASSIGNING FIELD-SYMBOL(<ls_inv>).
    CALL FUNCTION 'BAPI_PO_GETDETAIL1'
      EXPORTING
        purchaseorder = <ls_inv>-po_number
      IMPORTING
        poheader      = gs_po_header
      TABLES
        poitem        = gt_po_items
        return        = gt_return.
    IF sy-subrc <> 0 OR gt_po_items IS INITIAL.
      gv_code = 'E002'.
      MESSAGE 'No purchase order found for the invoice' TYPE 'I'.
      CONTINUE.
    ENDIF.
    CALL FUNCTION 'BAPI_GOODSMVT_GETITEMS'
      TABLES
        goodsmvt_item = gt_receipts
        return        = gt_return.
    IF sy-subrc <> 0 OR gt_receipts IS INITIAL.
      gv_code = 'E003'.
      MESSAGE 'No goods receipt found for the purchase order' TYPE 'I'.
      CONTINUE.
    ENDIF.
    CLEAR gs_docline.
    gs_docline-invoice      = p_doc.
    gs_docline-po_number    = <ls_inv>-po_number.
    gs_docline-po_item      = <ls_inv>-po_item.
    gs_docline-quantity     = <ls_inv>-quantity.
    gs_docline-inv_amount   = <ls_inv>-item_amount.
    gs_docline-kind         = 'NEW'.
    gs_docline-amount_known = abap_true.
    APPEND gs_docline TO gt_doclines.
  ENDLOOP.
  CALL FUNCTION 'Z_MM_RECEIPT_SNAPSHOT'
    EXPORTING
      iv_invoice  = p_doc
    IMPORTING
      es_snapshot = gs_snapshot
    EXCEPTIONS
      failed      = 1
      OTHERS      = 2.
  IF sy-subrc <> 0 OR gs_snapshot-taken_on IS INITIAL.
    gv_failed = abap_true.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
* The three-way check: invoice against purchase order and goods receipt.
*----------------------------------------------------------------------*
FORM evaluate.
  DATA: lv_raw    TYPE p LENGTH 16 DECIMALS 0,
        lv_scaled TYPE p LENGTH 16 DECIMALS 0,
        lv_diff   TYPE p LENGTH 15 DECIMALS 2,
        lv_limit  TYPE p LENGTH 15 DECIMALS 2.

  IF p_demo = abap_false.
    PERFORM read_documents.
  ENDIF.
  IF gv_code IS NOT INITIAL.
    RETURN.
  ENDIF.
  IF gs_snapshot-complete = abap_false OR gs_snapshot-taken_on IS INITIAL.
    MESSAGE 'The goods receipt snapshot is not complete' TYPE 'I'.
    RETURN.
  ENDIF.
  IF p_dec < 0 OR p_dec > 6.
    MESSAGE 'Decimals must be between 0 and 6' TYPE 'E'.
  ENDIF.
  IF lines( gt_doclines ) = 0.
    RETURN.
  ENDIF.

  LOOP AT gt_doclines INTO gs_docline.
    IF gv_failed = abap_true OR gs_docline-kind = gc_kind_reversal OR gs_docline-reversed = abap_true.
      gs_docline-status = gc_status_rejected.
      MODIFY gt_doclines FROM gs_docline.
      CONTINUE.
    ENDIF.
    lv_raw = gs_docline-quantity.
    IF lv_raw > gc_max_raw.
      gs_docline-status = gc_status_rejected.
      MODIFY gt_doclines FROM gs_docline.
      CONTINUE.
    ENDIF.
    lv_scaled = gs_docline-inv_amount * 100.
    IF lv_scaled > gc_max_scaled.
      gs_docline-status = gc_status_rejected.
      MODIFY gt_doclines FROM gs_docline.
      CONTINUE.
    ENDIF.
    IF gs_docline-quantity <= 0.
      gs_docline-status = gc_status_rejected.
      gs_docline-code = 'Q001'.
      MODIFY gt_doclines FROM gs_docline.
      CONTINUE.
    ENDIF.
    lv_diff = gs_docline-inv_amount - gs_docline-po_amount.
    IF lv_diff < 0.
      lv_diff = - lv_diff.
    ENDIF.
    lv_limit = gs_docline-po_amount * p_tol / 100.
    IF lv_diff > lv_limit.
      gs_docline-status = gc_status_blocked.
      gs_docline-code = 'T001'.
    ELSEIF gs_docline-inv_amount > gs_docline-po_amount.
      gs_docline-status = gc_status_matched.
      gs_docline-code = 'T002'.
    ELSE.
      gs_docline-status = gc_status_matched.
    ENDIF.
    MODIFY gt_doclines FROM gs_docline.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
* The result list.
*----------------------------------------------------------------------*
FORM show_results.
  DATA lo_alv TYPE REF TO cl_salv_table.
  LOOP AT gt_doclines INTO gs_docline.
    IF gs_docline-status = gc_status_rejected.
      WRITE: / gs_docline-invoice, gs_docline-po_number, 'Rejected'.
    ELSEIF gs_docline-amount_known = abap_true AND gs_docline-code IS INITIAL.
      WRITE: / gs_docline-invoice, gs_docline-po_number, gs_docline-inv_amount.
    ENDIF.
    IF p_det = abap_true.
      WRITE: / gs_docline-po_item, gs_docline-quantity, gs_docline-code.
    ENDIF.
  ENDLOOP.
  IF p_list = abap_true AND sy-batch = abap_false.
    cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv CHANGING t_table = gt_doclines ).
    lo_alv->display( ).
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
* The result as a file on the user's PC.
*----------------------------------------------------------------------*
FORM download_csv.
  DATA lv_line TYPE string.
  CLEAR gt_csv.
  APPEND 'Invoice;PO;Item;Quantity;Status;Code' TO gt_csv.
  LOOP AT gt_doclines INTO gs_docline.
    lv_line = |{ gs_docline-invoice };{ gs_docline-po_number };{ gs_docline-po_item };{ gs_docline-quantity };{ gs_docline-status };{ gs_docline-code }|.
    APPEND lv_line TO gt_csv.
  ENDLOOP.
  CALL METHOD cl_gui_frontend_services=>gui_download
    EXPORTING
      filename = 'C:\temp\receipt_invoice_check.csv'
    CHANGING
      data_tab = gt_csv
    EXCEPTIONS
      OTHERS   = 1.
  IF sy-subrc <> 0.
    MESSAGE 'The file could not be saved' TYPE 'I'.
  ENDIF.
ENDFORM.
