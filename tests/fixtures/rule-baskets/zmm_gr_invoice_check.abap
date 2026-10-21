*&---------------------------------------------------------------------*
*& Report ZMM_GR_INVOICE_CHECK
*&---------------------------------------------------------------------*
*& Synthetic program, written for tests/rule-baskets.spec.ts (roadmap
*& 3.0.20, the new set-up of the business rules, owner 21.10.2026): a
*& goods receipt and invoice check with the shapes a business sets
*& (tolerances, an approval amount, document types, a company code, a
*& payment deadline) beside the shapes that stay as coded (plausibility
*& checks, a row cap, a log level, a test run, its own demo data with a
*& demo-case switch). No customer code; every value is invented.
*&---------------------------------------------------------------------*
REPORT zmm_gr_invoice_check.

TABLES: ekko.

CONSTANTS: c_max_rows   TYPE i VALUE 999999,
           c_price_tol  TYPE p DECIMALS 2 VALUE '5.00',
           c_approval   TYPE p DECIMALS 2 VALUE '250.00'.

TYPES: BEGIN OF ty_invoice,
         belnr TYPE belnr_d,
         bukrs TYPE bukrs,
         blart TYPE blart,
         ebeln TYPE ebeln,
         waers TYPE waers,
         wrbtr TYPE wrbtr,
         menge TYPE menge_d,
         price_dev TYPE p DECIMALS 2,
         qty_dev   TYPE p DECIMALS 2,
         due_days  TYPE i,
         hold      TYPE c LENGTH 1,
         status    TYPE c LENGTH 10,
       END OF ty_invoice.

DATA: gt_invoice  TYPE STANDARD TABLE OF ty_invoice,
      gv_count    TYPE i,
      gv_loglevel TYPE c LENGTH 5.

PARAMETERS: p_bukrs TYPE bukrs DEFAULT '1000',
            p_test  AS CHECKBOX DEFAULT 'X',
            p_demo  AS CHECKBOX DEFAULT ' ',
            p_case  TYPE i DEFAULT 1.

START-OF-SELECTION.
  IF p_demo = 'X'.
    PERFORM build_demo_data.
    PERFORM apply_demo_case.
  ELSE.
    PERFORM read_invoices.
  ENDIF.
  PERFORM check_invoices.
  PERFORM post_results.

FORM build_demo_data.
  DATA ls_inv TYPE ty_invoice.
  ls_inv-belnr = '5100000001'.
  ls_inv-bukrs = '1000'.
  ls_inv-blart = 'RE'.
  ls_inv-waers = 'EUR'.
  ls_inv-wrbtr = '180.00'.
  APPEND ls_inv TO gt_invoice.
ENDFORM.

FORM apply_demo_case.
  FIELD-SYMBOLS <ls_inv> TYPE ty_invoice.
  LOOP AT gt_invoice ASSIGNING <ls_inv>.
    CASE p_case.
      WHEN 1.
        <ls_inv>-wrbtr = '300.00'.
      WHEN 2.
        <ls_inv>-price_dev = '7.50'.
      WHEN 3.
        <ls_inv>-qty_dev = '3.00'.
      WHEN 4.
        <ls_inv>-due_days = 30.
    ENDCASE.
  ENDLOOP.
ENDFORM.

FORM read_invoices.
  SELECT belnr bukrs blart ebeln waers wrbtr
    FROM rbkp
    INTO CORRESPONDING FIELDS OF TABLE gt_invoice
    WHERE bukrs = p_bukrs.
  IF sy-subrc <> 0.
    MESSAGE 'No invoices found' TYPE 'S'.
    RETURN.
  ENDIF.
  DESCRIBE TABLE gt_invoice LINES gv_count.
  IF gv_count > c_max_rows.
    MESSAGE 'Too many invoices for one run' TYPE 'E'.
  ENDIF.
ENDFORM.

FORM check_invoices.
  FIELD-SYMBOLS <ls_inv> TYPE ty_invoice.
  LOOP AT gt_invoice ASSIGNING <ls_inv>.
    IF <ls_inv>-ebeln IS INITIAL.
      CONTINUE.
    ENDIF.
    IF <ls_inv>-bukrs <> '1000'.
      CONTINUE.
    ENDIF.
    IF <ls_inv>-blart = 'RE' OR <ls_inv>-blart = 'KR'.
      <ls_inv>-status = 'VENDOR'.
    ENDIF.
    IF <ls_inv>-price_dev > c_price_tol.
      <ls_inv>-hold = 'X'.
      PERFORM block_for_payment USING <ls_inv>.
    ENDIF.
    IF <ls_inv>-qty_dev > '2.00'.
      <ls_inv>-hold = 'X'.
      PERFORM block_for_payment USING <ls_inv>.
    ENDIF.
    IF <ls_inv>-waers = 'EUR' AND <ls_inv>-wrbtr > c_approval.
      PERFORM request_approval USING <ls_inv>.
    ENDIF.
    IF <ls_inv>-due_days > 14.
      PERFORM remind_buyer USING <ls_inv>.
    ENDIF.
    IF <ls_inv>-status = 'VENDOR'.
      PERFORM add_vendor_note USING <ls_inv>.
    ENDIF.
  ENDLOOP.
ENDFORM.

FORM post_results.
  IF p_test = 'X'.
    MESSAGE 'Test run - nothing posted' TYPE 'S'.
    RETURN.
  ENDIF.
  IF gv_loglevel = 'DEBUG'.
    PERFORM write_log.
  ENDIF.
  CALL FUNCTION 'Z_POST_INVOICE_HOLDS'
    TABLES
      it_invoice = gt_invoice.
ENDFORM.

FORM block_for_payment USING is_inv TYPE ty_invoice.
  CALL FUNCTION 'Z_SET_PAYMENT_BLOCK'
    EXPORTING
      iv_belnr = is_inv-belnr.
ENDFORM.

FORM request_approval USING is_inv TYPE ty_invoice.
  CALL FUNCTION 'Z_START_INVOICE_APPROVAL'
    EXPORTING
      iv_belnr = is_inv-belnr.
ENDFORM.

FORM remind_buyer USING is_inv TYPE ty_invoice.
  CALL FUNCTION 'Z_SEND_BUYER_REMINDER'
    EXPORTING
      iv_ebeln = is_inv-ebeln.
ENDFORM.

FORM add_vendor_note USING is_inv TYPE ty_invoice.
  CALL FUNCTION 'Z_ADD_VENDOR_NOTE'
    EXPORTING
      iv_belnr = is_inv-belnr.
ENDFORM.

FORM write_log.
  WRITE: / 'Invoices checked:', gv_count.
ENDFORM.
