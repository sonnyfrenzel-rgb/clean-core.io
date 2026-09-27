CLASS zcx_pm_breakdown DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    DATA mv_text TYPE string READ-ONLY.

    METHODS constructor
      IMPORTING textid   LIKE textid OPTIONAL
                previous LIKE previous OPTIONAL
                iv_text  TYPE string OPTIONAL.
    METHODS get_text REDEFINITION.
ENDCLASS.



CLASS zcx_pm_breakdown IMPLEMENTATION.

  METHOD constructor ##ADT_SUPPRESS_GENERATION.
    super->constructor( textid = textid previous = previous ).
    mv_text = iv_text.
  ENDMETHOD.

  METHOD get_text.
    result = mv_text.
  ENDMETHOD.

ENDCLASS.
