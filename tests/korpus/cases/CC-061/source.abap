REPORT zce_template.
CLASS lcl_counter DEFINITION.
  PUBLIC SECTION.
    CLASS-DATA calls TYPE i.
    CLASS-METHODS tick RETURNING VALUE(text) TYPE string.
ENDCLASS.
CLASS lcl_counter IMPLEMENTATION.
  METHOD tick.
    calls = calls + 1.
    text = `tick`.
  ENDMETHOD.
ENDCLASS.
START-OF-SELECTION.
  DATA(unused_text) = |{ lcl_counter=>tick( ) }|.
  WRITE / lcl_counter=>calls.
