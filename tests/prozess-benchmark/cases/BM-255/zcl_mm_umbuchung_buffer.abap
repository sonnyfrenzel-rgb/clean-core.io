CLASS zcl_mm_umbuchung_buffer DEFINITION
  PUBLIC
  ABSTRACT
  FINAL.

*----------------------------------------------------------------------*
* Transaktionspuffer des unmanaged BOs ZR_UMBUCHUNG
* (statisch - lebt so lange wie die RAP-Transaktion im Modus)
*
* Aenderungshistorie
* 2023-03-14 KW  Erstellung (Ersatz fuer Z-Transaktion ZMB1B)
* 2023-05-02 KW  Loeschen entfernt - Umbuchungen werden nur noch storniert
* 2023-11-20 PH  Nummernvergabe ueber Nummernkreis ZMM_UMB/01
* 2024-02-07 PH  Puffer statisch (vorher Singleton get_instance)
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    TYPES: ty_umb TYPE zmm_umbuchung,
           tt_umb TYPE STANDARD TABLE OF zmm_umbuchung WITH EMPTY KEY.

    CLASS-DATA: mt_ins TYPE tt_umb READ-ONLY,
                mt_upd TYPE tt_umb READ-ONLY.

    CLASS-METHODS neu
      IMPORTING is_umb       TYPE ty_umb
      RETURNING VALUE(rv_id) TYPE zmm_umb_id.

    "! leer, wenn weder im Puffer noch auf der Datenbank vorhanden
    CLASS-METHODS lesen
      IMPORTING iv_id         TYPE zmm_umb_id
      RETURNING VALUE(rs_umb) TYPE ty_umb.

    CLASS-METHODS aendern
      IMPORTING is_umb TYPE ty_umb.

    CLASS-METHODS leeren.
ENDCLASS.



CLASS zcl_mm_umbuchung_buffer IMPLEMENTATION.

  METHOD neu.
    CALL FUNCTION 'NUMBER_GET_NEXT'
      EXPORTING
        nr_range_nr = '01'
        object      = 'ZMM_UMB'
      IMPORTING
        number      = rv_id
      EXCEPTIONS
        OTHERS      = 1.

    DATA(ls_umb)       = is_umb.
    ls_umb-umb_id      = rv_id.
    ls_umb-status      = zbp_r_umbuchung=>gc_status-offen.
    ls_umb-erfasst_von = sy-uname.
    GET TIME STAMP FIELD ls_umb-erfasst_am.
    APPEND ls_umb TO mt_ins.
  ENDMETHOD.


  METHOD lesen.
*   zuerst Puffer (Aenderung vor Anlage), dann Datenbank
    rs_umb = VALUE #( mt_upd[ umb_id = iv_id ]
                      DEFAULT VALUE #( mt_ins[ umb_id = iv_id ] OPTIONAL ) ).
    IF rs_umb IS INITIAL.
      SELECT SINGLE * FROM zmm_umbuchung
        WHERE umb_id = @iv_id
        INTO @rs_umb.
    ENDIF.
  ENDMETHOD.


  METHOD aendern.
    READ TABLE mt_ins ASSIGNING FIELD-SYMBOL(<ls_ins>) WITH KEY umb_id = is_umb-umb_id.
    IF sy-subrc = 0.
      <ls_ins> = is_umb.          "noch nicht gesichert: Anlage ueberschreiben
      RETURN.
    ENDIF.
    DELETE mt_upd WHERE umb_id = is_umb-umb_id.
    APPEND is_umb TO mt_upd.
  ENDMETHOD.


  METHOD leeren.
    CLEAR: mt_ins, mt_upd.
  ENDMETHOD.

ENDCLASS.
