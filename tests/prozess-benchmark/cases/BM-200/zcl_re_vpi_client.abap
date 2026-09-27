*----------------------------------------------------------------------*
* Klasse ZCL_RE_VPI_CLIENT
* Verbraucherpreisindex (VPI) ueber REST-Schnittstelle (Destination
* in SM59, Typ G). Antwortformat JSON:
* { "series":"VPI2020", "points":[ {"period":"202405","value":"119.3",
*   "status":"f"}, ... ] }      status f = endgueltig, p = vorlaeufig
*----------------------------------------------------------------------*
CLASS zcl_re_vpi_client DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS constructor
      IMPORTING
        iv_destination TYPE rfcdest.
    METHODS get_value
      IMPORTING
        iv_series       TYPE string
        iv_period       TYPE spmon
      RETURNING
        VALUE(rv_value) TYPE zre_vpi_value
      RAISING
        zcx_re_vpi.

  PRIVATE SECTION.
    TYPES: BEGIN OF ts_point,
             period TYPE string,
             value  TYPE string,
             status TYPE string,
           END OF ts_point,
           tt_point TYPE STANDARD TABLE OF ts_point WITH DEFAULT KEY,
           BEGIN OF ts_response,
             series TYPE string,
             points TYPE tt_point,
           END OF ts_response.

    DATA mv_destination TYPE rfcdest.
ENDCLASS.



CLASS zcl_re_vpi_client IMPLEMENTATION.

  METHOD constructor.
    mv_destination = iv_destination.
  ENDMETHOD.


  METHOD get_value.

    DATA: lo_http     TYPE REF TO if_http_client,
          ls_response TYPE ts_response,
          lv_code     TYPE i,
          lv_rc       TYPE sysubrc,
          lv_json     TYPE string.

    cl_http_client=>create_by_destination(
      EXPORTING
        destination = mv_destination
      IMPORTING
        client      = lo_http
      EXCEPTIONS
        OTHERS      = 1 ).

    cl_http_utility=>set_request_uri(
      request = lo_http->request
      uri     = |/series/{ iv_series }/values?from={ iv_period }&to={ iv_period }| ).
    lo_http->request->set_method( if_http_request=>co_request_method_get ).
    lo_http->request->set_header_field( name  = 'Accept'
                                        value = 'application/json' ).

    lo_http->send( EXCEPTIONS OTHERS = 1 ).
    lo_http->receive( EXCEPTIONS OTHERS = 2 ).
    lv_rc = sy-subrc.
    lo_http->response->get_status( IMPORTING code = lv_code ).
    lv_json = lo_http->response->get_cdata( ).
    lo_http->close( ).

    IF lv_rc <> 0 OR lv_code <> 200.
      RAISE EXCEPTION TYPE zcx_re_vpi
        EXPORTING
          textid    = zcx_re_vpi=>http_error
          http_code = lv_code.
    ENDIF.

    /ui2/cl_json=>deserialize(
      EXPORTING
        json        = lv_json
        pretty_name = /ui2/cl_json=>pretty_mode-camel_case
      CHANGING
        data        = ls_response ).

    READ TABLE ls_response-points INTO DATA(ls_point)
         WITH KEY period = CONV string( iv_period ).
*   vorlaeufige Werte (status p) wurden bis 2023 akzeptiert
*   IF sy-subrc <> 0.
    IF sy-subrc <> 0 OR ls_point-status <> 'f'.
      RAISE EXCEPTION TYPE zcx_re_vpi
        EXPORTING
          textid = zcx_re_vpi=>no_final_value
          period = iv_period.
    ENDIF.

    rv_value = ls_point-value.

  ENDMETHOD.

ENDCLASS.
