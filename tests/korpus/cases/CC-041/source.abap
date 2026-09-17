REPORT zcc_ref_041.
PARAMETERS p_byname AS CHECKBOX DEFAULT space.
CLASS lcl_reader DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS get_by_id RETURNING VALUE(rv_text) TYPE string.
    METHODS get_by_name RETURNING VALUE(rv_text) TYPE string.
ENDCLASS.
CLASS lcl_reader IMPLEMENTATION.
  METHOD get_by_id.
    rv_text = 'BY_ID'.
  ENDMETHOD.
  METHOD get_by_name.
    rv_text = 'BY_NAME'.
  ENDMETHOD.
ENDCLASS.
DATA lv_meth TYPE c LENGTH 30.
DATA lv_text TYPE string.
START-OF-SELECTION.
  IF p_byname = 'X'.
    lv_meth = 'GET_BY_NAME'.
  ELSE.
    lv_meth = 'GET_BY_ID'.
  ENDIF.
  DATA(lo_reader) = NEW lcl_reader( ).
  CALL METHOD lo_reader->(lv_meth)
    RECEIVING rv_text = lv_text.
  WRITE / lv_text.
