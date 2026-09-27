CLASS zcl_leih_v_ausgabe IMPLEMENTATION.
*----------------------------------------------------------------------*
* BOPF-Validierung ZLEIHGERAET / Knoten ROOT, Aktionsprüfung "Ausgeben"
* Leihgeräte (Ersatzgeräte) für Kunden während der Reparatur
*----------------------------------------------------------------------*
  METHOD /bobf/if_frw_validation~execute.
    DATA lt_root TYPE ztleih_root.

    CLEAR et_failed_key.

    io_read->retrieve(
      EXPORTING
        iv_node = zif_leihgeraet_c=>sc_node-root
        it_key  = it_key
      IMPORTING
        et_data = lt_root ).

    LOOP AT lt_root ASSIGNING FIELD-SYMBOL(<ls_root>).

      " Rückgabe darf nicht vor der Ausgabe liegen
      IF <ls_root>-rueckgabe_soll < <ls_root>-ausgabe_datum.
        add_fehler( EXPORTING iv_key = <ls_root>-key iv_msgno = '001'
                    CHANGING  ct_failed_key = et_failed_key co_message = eo_message ).
        CONTINUE.
      ENDIF.

      " Kunde gesperrt (Auftrags-/Liefersperre zentral)?
      SELECT SINGLE aufsd, lifsd FROM kna1
        WHERE kunnr = @<ls_root>-kunnr
        INTO @DATA(ls_sperre).
      IF sy-subrc <> 0 OR ls_sperre-aufsd IS NOT INITIAL OR ls_sperre-lifsd IS NOT INITIAL.
        add_fehler( EXPORTING iv_key = <ls_root>-key iv_msgno = '002'
                    CHANGING  ct_failed_key = et_failed_key co_message = eo_message ).
        CONTINUE.
      ENDIF.

      " Höchstens 3 Leihgeräte gleichzeitig beim Kunden
      SELECT COUNT(*) FROM zleih_root
        WHERE kunnr  = @<ls_root>-kunnr
          AND status = 'A'
          AND db_key <> @<ls_root>-key
        INTO @DATA(lv_anzahl).
      IF lv_anzahl >= 3.
        add_fehler( EXPORTING iv_key = <ls_root>-key iv_msgno = '003'
                    CHANGING  ct_failed_key = et_failed_key co_message = eo_message ).
      ENDIF.
*     IF <ls_root>-kaution IS INITIAL.        "Kautionspflicht - Fachbereich
*       add_fehler( ... iv_msgno = '004' ... ). "hat 2020 abgelehnt
*     ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD add_fehler.
    INSERT VALUE #( key = iv_key ) INTO TABLE ct_failed_key.
    co_message = COND #( WHEN co_message IS BOUND THEN co_message
                         ELSE /bobf/cl_frw_factory=>get_message( ) ).
    co_message->add_message(
      is_msg  = VALUE #( msgid = 'ZLEIH' msgno = iv_msgno msgty = 'E' )
      iv_node = zif_leihgeraet_c=>sc_node-root
      iv_key  = iv_key ).
  ENDMETHOD.
ENDCLASS.
