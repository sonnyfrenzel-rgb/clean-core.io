*&---------------------------------------------------------------------*
*&  Include           ZQM_ERG_ERFASSUNG_C03
*&---------------------------------------------------------------------*
*  Ausnahme und Protokoll (Protokoll nur fuer Supportfaelle, keine
*  Prozesswirkung - wird im Job ZQM_LOG_SHIP nachts versendet)
*----------------------------------------------------------------------*

CLASS lcx_erf DEFINITION INHERITING FROM cx_static_check FINAL.
  PUBLIC SECTION.
    INTERFACES if_t100_dyn_msg.
ENDCLASS.
CLASS lcx_erf IMPLEMENTATION.
ENDCLASS.

CLASS lcl_log DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-DATA gt_text TYPE STANDARD TABLE OF string WITH EMPTY KEY READ-ONLY.
    CLASS-METHODS add
      IMPORTING iv_text TYPE csequence.
ENDCLASS.

CLASS lcl_log IMPLEMENTATION.
  METHOD add.
    APPEND |{ sy-uname } { sy-datum } { sy-uzeit } { iv_text }| TO gt_text.
  ENDMETHOD.
ENDCLASS.
