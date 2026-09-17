REPORT zcc_ref_004.
PARAMETERS p_text TYPE c LENGTH 80 LOWER CASE DEFAULT 'A B'.
CLASS lcl_url DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS encode IMPORTING iv_text TYPE string
                         RETURNING VALUE(rv_text) TYPE string.
ENDCLASS.
CLASS lcl_url IMPLEMENTATION.
  METHOD encode.
    rv_text = cl_http_utility=>escape_url( unescaped = iv_text ).
  ENDMETHOD.
ENDCLASS.
START-OF-SELECTION.
  DATA(lv_result) = lcl_url=>encode( CONV string( p_text ) ).
  WRITE / lv_result.
