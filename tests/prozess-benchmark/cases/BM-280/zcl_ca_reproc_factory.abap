CLASS zcl_ca_reproc_factory DEFINITION
  PUBLIC
  FINAL
  CREATE PRIVATE.
*----------------------------------------------------------------------*
* Liefert die Nachverarbeitungsklasse einer Schnittstelle (ZCA_IF_CUST).
* Die Klasse muss ZIF_CA_REPROCESSOR implementieren.
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    CLASS-METHODS get
      IMPORTING iv_ifcode        TYPE zca_ifcode
      RETURNING VALUE(ro_reproc) TYPE REF TO zif_ca_reprocessor
      RAISING   zcx_ca_reproc.
ENDCLASS.



CLASS zcl_ca_reproc_factory IMPLEMENTATION.

  METHOD get.
    DATA lo_object TYPE REF TO object.

    SELECT SINGLE reproc_class FROM zca_if_cust INTO @DATA(lv_class)
      WHERE ifcode = @iv_ifcode.
    IF sy-subrc <> 0 OR lv_class IS INITIAL.
      RAISE EXCEPTION TYPE zcx_ca_reproc
        EXPORTING
          textid = zcx_ca_reproc=>no_handler.
    ENDIF.

    TRY.
        CREATE OBJECT lo_object TYPE (lv_class).
        ro_reproc = CAST zif_ca_reprocessor( lo_object ).
      CATCH cx_sy_create_object_error cx_sy_move_cast_error.
        RAISE EXCEPTION TYPE zcx_ca_reproc
          EXPORTING
            textid = zcx_ca_reproc=>invalid_handler.
    ENDTRY.
  ENDMETHOD.

ENDCLASS.
