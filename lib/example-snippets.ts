import type { ExampleSnippet } from './example-catalog';

/**
 * The short snippets shipped with the example gallery. Moved out of the
 * dashboard so every page that shows examples offers the same list
 * (owner feedback 01.10.2026). Each one is described by its own code
 * (`describeSnippet` in `lib/example-catalog.ts`), never by a shared category sentence.
 */
export const EXAMPLE_SNIPPETS: readonly ExampleSnippet[] = [
  {
    id: 'static-report-alv',
    name: 'Z_FI_INVOICE_REPORT.abap',
    code: `REPORT Z_FI_INVOICE_REPORT.
*----------------------------------------------------------------------*
* Classic ABAP Invoice Report with ALV Grid Output
*----------------------------------------------------------------------*
TYPES: BEGIN OF ty_invoice,
         belnr TYPE belnr_d,
         gjahr TYPE gjahr,
         blart TYPE blart,
         bldat TYPE bldat,
         wrbtr TYPE wrbtr,
         waers TYPE waers,
       END OF ty_invoice.

DATA: lt_invoices TYPE TABLE OF ty_invoice,
      ls_invoice  TYPE ty_invoice.

START-OF-SELECTION.
  SELECT belnr gjahr blart bldat wrbtr waers
    FROM bkpf
    INTO TABLE lt_invoices
    UP TO 100 ROWS
    WHERE blart = 'KR'.

  IF lt_invoices IS INITIAL.
    WRITE: 'No invoices found for vendor billing.'.
  ELSE.
    LOOP AT lt_invoices INTO ls_invoice.
      WRITE: / ls_invoice-belnr, ls_invoice-gjahr, ls_invoice-wrbtr, ls_invoice-waers.
    ENDLOOP.
  ENDIF.`,
  },
  {
    id: 'static-rfc-bapi',
    name: 'Z_CUSTOMER_GET_DETAIL.abap',
    code: `FUNCTION Z_CUSTOMER_GET_DETAIL.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(CUSTOMER_ID) TYPE  KUNNR
*"  EXPORTING
*"     VALUE(CUSTOMER_NAME) TYPE  NAME1_GP
*"     VALUE(CITY) TYPE  ORT01_GP
*"  EXCEPTIONS
*"      CUSTOMER_NOT_FOUND
*"----------------------------------------------------------------------
  SELECT SINGLE name1 ort01
    FROM kna1
    INTO (customer_name, city)
    WHERE kunnr = customer_id.

  IF sy-subrc <> 0.
    RAISE customer_not_found.
  ENDIF.
ENDFUNCTION.`,
  },
  {
    id: 'static-db-crud',
    name: 'Z_CREATE_MATERIAL.abap',
    code: `REPORT Z_CREATE_MATERIAL.
*----------------------------------------------------------------------*
* Create Material Record in Custom SAP Material Table
*----------------------------------------------------------------------*
PARAMETERS: p_matnr TYPE matnr OBLIGATORY,
            p_maktx TYPE maktx OBLIGATORY,
            p_meins TYPE meins DEFAULT 'PC'.

DATA: ls_mat TYPE zmat_table.

START-OF-SELECTION.
  ls_mat-matnr = p_matnr.
  ls_mat-maktx = p_maktx.
  ls_mat-meins = p_meins.
  ls_mat-ernam = sy-uname.
  ls_mat-erdat = sy-datum.

  INSERT zmat_table FROM ls_mat.
  IF sy-subrc = 0.
    COMMIT WORK.
    WRITE: / 'Material record created successfully: ', p_matnr.
  ELSE.
    ROLLBACK WORK.
    WRITE: / 'Failed to insert material record.'.
  ENDIF.`,
  },
  {
    id: 'static-oo-abap',
    name: 'ZCL_FLIGHT_CONTROLLER.abap',
    code: `CLASS zcl_flight_controller DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS: get_flight_details
               IMPORTING iv_carrier TYPE s_carr_id
               EXPORTING et_flights TYPE spfli_tab.
ENDCLASS.

CLASS zcl_flight_controller IMPLEMENTATION.
  METHOD get_flight_details.
    SELECT *
      FROM spfli
      INTO TABLE et_flights
      WHERE carrid = iv_carrier.
  ENDMETHOD.
ENDCLASS.`,
  },
  {
    id: 'static-sales-order',
    name: 'Z_SALES_ORDER_CREATOR.abap',
    code: `REPORT Z_SALES_ORDER_CREATOR.
*----------------------------------------------------------------------*
* Classic ABAP Sales Order Creation using BAPI wrapper
*----------------------------------------------------------------------*
DATA: l_header  TYPE bapisdhd1,
      lt_items  TYPE TABLE OF bapisditm,
      ls_item   TYPE bapisditm,
      lt_return TYPE TABLE OF bapiret2.

START-OF-SELECTION.
  l_header-doc_type   = 'TA'.
  l_header-sales_org  = '1000'.
  l_header-distr_chan = '10'.
  l_header-division   = '00'.

  ls_item-itm_number = '000010'.
  ls_item-material   = 'MAT-0001'.
  ls_item-target_qty = '5'.
  APPEND ls_item TO lt_items.

  CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
    EXPORTING
      order_header_in = l_header
    TABLES
      return          = lt_return
      order_items_in  = lt_items.

  READ TABLE lt_return WITH KEY type = 'E' TRANSPORTING NO FIELDS.
  IF sy-subrc = 0.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    WRITE: / 'Error creating sales order.'.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    WRITE: / 'Sales order created successfully.'.
  ENDIF.`,
  },
  {
    id: 'static-partner-integrator',
    name: 'ZCL_PARTNER_INTEGRATOR.abap',
    code: `CLASS zcl_partner_integrator DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS: fetch_external_partner
               IMPORTING iv_partner_id TYPE string
               EXPORTING ev_json_response TYPE string.
ENDCLASS.

CLASS zcl_partner_integrator IMPLEMENTATION.
  METHOD fetch_external_partner.
    DATA: lo_http_client TYPE REF TO if_http_client,
          lv_url         TYPE string.

    lv_url = |https://api.clean-core.io/partners/{ iv_partner_id }|.

    cl_http_client=>create_by_url(
      EXPORTING
        url                = lv_url
      IMPORTING
        client             = lo_http_client
      EXCEPTIONS
        argument_not_found = 1
        plugin_not_active  = 2
        internal_error     = 3 ).

    IF sy-subrc = 0.
      lo_http_client->request->set_method( 'GET' ).
      lo_http_client->send( ).
      lo_http_client->receive( ).
      ev_json_response = lo_http_client->response->get_cdata( ).
      lo_http_client->close( ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.`,
  }
];
