*&---------------------------------------------------------------------*
*& Report ZFI_VENDOR_INVOICE_CHECK
*&---------------------------------------------------------------------*
*& Synthetic FI-like fixture for the rule explanation engine (3.0.20).
*& Written for the spec tests/rule-decision-flow.spec.ts: the shapes of
*& the owner report of 21.10.2026 - a raw-amount cap, a decimals setting,
*& a house currency, a document kind, a compound vendor check.
*&---------------------------------------------------------------------*
REPORT zfi_vendor_invoice_check.

TABLES: bkpf.

CONSTANTS: c_max_raw   TYPE p LENGTH 16 DECIMALS 0 VALUE 1000000000,
           c_dec       TYPE i VALUE 2,
           c_currency  TYPE waers VALUE 'EUR',
           c_kind_rev  TYPE c LENGTH 3 VALUE 'REV',
           c_bukrs     TYPE bukrs VALUE '1000',
           c_tolerance TYPE p LENGTH 8 DECIMALS 2 VALUE '250.00'.

TYPES: BEGIN OF ty_invoice,
         belnr TYPE belnr_d,
         bukrs TYPE bukrs,
         lifnr TYPE lifnr,
         waers TYPE waers,
         wrbtr TYPE wrbtr,
         zterm TYPE dzterm,
         kind  TYPE c LENGTH 3,
         budat TYPE budat,
         zlspr TYPE dzlspr,
       END OF ty_invoice.

DATA: gt_invoices TYPE STANDARD TABLE OF ty_invoice,
      gs_invoice  TYPE ty_invoice,
      gv_raw      TYPE p LENGTH 16 DECIMALS 0,
      gv_amount   TYPE p LENGTH 16 DECIMALS 2,
      gv_days     TYPE i,
      gv_blocked  TYPE abap_bool.

SELECT-OPTIONS: s_bukrs FOR bkpf-bukrs.
PARAMETERS: p_test TYPE abap_bool AS CHECKBOX.

START-OF-SELECTION.
  PERFORM read_invoices.
  LOOP AT gt_invoices INTO gs_invoice.
    PERFORM check_invoice.
  ENDLOOP.

FORM read_invoices.
  SELECT belnr bukrs lifnr waers wrbtr zterm budat
    FROM bsik INTO CORRESPONDING FIELDS OF TABLE gt_invoices
    WHERE bukrs IN s_bukrs.
  IF sy-subrc <> 0.
    MESSAGE e001(zfi).
  ENDIF.
ENDFORM.

FORM check_invoice.
  CLEAR gv_blocked.
  IF gs_invoice-bukrs <> c_bukrs.
    RETURN.
  ENDIF.
  gv_raw = gs_invoice-wrbtr * 100.
  IF gv_raw > c_max_raw.
    MESSAGE w010(zfi).
    RETURN.
  ENDIF.
  gv_amount = round( val = gs_invoice-wrbtr dec = c_dec ).
  IF gs_invoice-waers <> c_currency.
    PERFORM convert_amount.
  ENDIF.
  IF gs_invoice-kind = c_kind_rev.
    PERFORM post_reversal.
    RETURN.
  ENDIF.
  IF gs_invoice-lifnr IS INITIAL
    OR gs_invoice-zterm IS INITIAL
    OR gs_invoice-zlspr = 'A'
    OR gs_invoice-zlspr = 'R'
    OR gs_invoice-budat IS INITIAL
    OR gs_invoice-belnr IS INITIAL.
    gv_blocked = abap_true.
    PERFORM block_payment.
    RETURN.
  ENDIF.
  IF gv_amount > c_tolerance.
    PERFORM request_approval.
  ELSE.
    PERFORM release_payment.
  ENDIF.
  gv_days = sy-datum - gs_invoice-budat.
  IF gv_days > 45.
    PERFORM send_reminder.
  ENDIF.
ENDFORM.

FORM convert_amount.
  CALL FUNCTION 'CONVERT_TO_LOCAL_CURRENCY'
    EXPORTING
      date             = sy-datum
      foreign_amount   = gs_invoice-wrbtr
      foreign_currency = gs_invoice-waers
      local_currency   = c_currency
    IMPORTING
      local_amount     = gv_amount.
ENDFORM.

FORM post_reversal.
  WRITE: / 'Reversal', gs_invoice-belnr.
ENDFORM.

FORM block_payment.
  UPDATE bseg SET zlspr = 'B' WHERE belnr = gs_invoice-belnr.
ENDFORM.

FORM request_approval.
  WRITE: / 'Approval needed', gs_invoice-belnr.
ENDFORM.

FORM release_payment.
  UPDATE bseg SET zlspr = space WHERE belnr = gs_invoice-belnr.
ENDFORM.

FORM send_reminder.
  WRITE: / 'Reminder', gs_invoice-belnr.
ENDFORM.
