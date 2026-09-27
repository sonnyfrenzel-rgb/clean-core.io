CLASS zcl_mm_po_protokoll DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* Nachrichtensammler je Bestellung, sichert ins Anwendungsprotokoll
* Objekt ZMM / Unterobjekt PO_PRUEFUNG, externe Nummer = Bestellnummer
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING iv_ebeln TYPE ebeln.
    METHODS hinzufuegen
      IMPORTING iv_schwere TYPE symsgty
                iv_text    TYPE string.
    METHODS hat_fehler
      RETURNING VALUE(rv_fehler) TYPE abap_bool.
    METHODS sichern.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_msg,
             schwere TYPE symsgty,
             text    TYPE string,
           END OF ty_msg.
    DATA: mv_ebeln TYPE ebeln,
          mt_msg   TYPE STANDARD TABLE OF ty_msg WITH EMPTY KEY.
ENDCLASS.



CLASS zcl_mm_po_protokoll IMPLEMENTATION.

  METHOD constructor.
    mv_ebeln = iv_ebeln.
  ENDMETHOD.


  METHOD hinzufuegen.
    APPEND VALUE #( schwere = iv_schwere text = iv_text ) TO mt_msg.
  ENDMETHOD.


  METHOD hat_fehler.
    rv_fehler = xsdbool( line_exists( mt_msg[ schwere = 'E' ] ) ).
  ENDMETHOD.


  METHOD sichern.
    DATA: lv_handle TYPE balloghndl.

*   Bestellungen ohne Befund bekommen kein Protokoll
    IF mt_msg IS INITIAL.
      RETURN.
    ENDIF.

    CALL FUNCTION 'BAL_LOG_CREATE'
      EXPORTING
        i_s_log      = VALUE bal_s_log( object    = 'ZMM'
                                        subobject = 'PO_PRUEFUNG'
                                        extnumber = CONV #( mv_ebeln )
                                        aldate_del = sy-datum + 180 )
      IMPORTING
        e_log_handle = lv_handle
      EXCEPTIONS
        OTHERS       = 1.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    LOOP AT mt_msg INTO DATA(ls_msg).
      CALL FUNCTION 'BAL_LOG_MSG_ADD_FREE_TEXT'
        EXPORTING
          i_log_handle = lv_handle
          i_msgty      = ls_msg-schwere
          i_text       = CONV char200( ls_msg-text )
        EXCEPTIONS
          OTHERS       = 1.
    ENDLOOP.

    CALL FUNCTION 'BAL_DB_SAVE'
      EXPORTING
        i_t_log_handle = VALUE bal_t_logh( ( lv_handle ) )
      EXCEPTIONS
        OTHERS         = 1.
  ENDMETHOD.

ENDCLASS.
