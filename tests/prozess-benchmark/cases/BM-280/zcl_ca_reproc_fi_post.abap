CLASS zcl_ca_reproc_fi_post DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* Nachverarbeitung abgelehnter FI-Buchungen (Payload = BAPI-Daten als XML)
  PUBLIC SECTION.
    INTERFACES zif_ca_reprocessor.
  PRIVATE SECTION.
    METHODS first_error
      IMPORTING it_return      TYPE bapiret2_t
      RETURNING VALUE(rv_text) TYPE bapi_msg.
ENDCLASS.



CLASS zcl_ca_reproc_fi_post IMPLEMENTATION.

  METHOD zif_ca_reprocessor~reprocess.
    DATA: ls_header TYPE bapiache09,
          lt_gl     TYPE STANDARD TABLE OF bapiacgl09,
          lt_curr   TYPE STANDARD TABLE OF bapiaccr09,
          lt_return TYPE bapiret2_t,
          lv_key    TYPE bapiache09-obj_key.

    TRY.
        CALL TRANSFORMATION id SOURCE XML is_entry-payload
                               RESULT header = ls_header
                                      gl     = lt_gl
                                      curr   = lt_curr.
      CATCH cx_transformation_error.
        rs_result-message = 'Buchungsdaten nicht lesbar'.
        RETURN.
    ENDTRY.

*   erst pruefen - Buchungsperiode koennte inzwischen geschlossen sein
    CALL FUNCTION 'BAPI_ACC_DOCUMENT_CHECK'
      EXPORTING
        documentheader = ls_header
      TABLES
        accountgl      = lt_gl
        currencyamount = lt_curr
        return         = lt_return.
    rs_result-message = first_error( lt_return ).
    IF rs_result-message IS NOT INITIAL.
      RETURN.
    ENDIF.

    CLEAR lt_return.
    CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
      EXPORTING
        documentheader = ls_header
      IMPORTING
        obj_key        = lv_key
      TABLES
        accountgl      = lt_gl
        currencyamount = lt_curr
        return         = lt_return.
    rs_result-message = first_error( lt_return ).
    IF rs_result-message IS NOT INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      RETURN.
    ENDIF.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    rs_result-ok      = abap_true.
    rs_result-message = |Beleg { lv_key(10) } gebucht|.
  ENDMETHOD.


  METHOD first_error.
    LOOP AT it_return INTO DATA(ls_ret) WHERE type CA 'EA'.
      rv_text = ls_ret-message.
      RETURN.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
