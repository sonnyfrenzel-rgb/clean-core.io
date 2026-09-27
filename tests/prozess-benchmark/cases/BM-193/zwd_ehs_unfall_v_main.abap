*&---------------------------------------------------------------------*
*& Web-Dynpro-Komponente ZWD_EHS_UNFALL - View V_MAIN
*& Erfassungsmaske Arbeitsunfall (Tab "Unfall" + Tabelle Zeugen)
*&---------------------------------------------------------------------*

METHOD wddoinit.
  DATA lv_unfall_nr TYPE zehs_unfall_nr.

* Message Manager der View merken
  wd_this->mo_msg_mgr = CAST if_wd_controller( wd_this->wd_get_api( ) )->get_message_manager( ).

* Aufruf aus dem Portal: ?UNFALL_NR=... -> Ändern, sonst Anlegen
  lv_unfall_nr = wdr_task=>client_window->get_parameter( 'UNFALL_NR' ).

* Berechtigung Z_EHS_UNF prüft das Portal-Rollenmenü (Konzept 2014)

  wd_comp_controller->load_unfall( iv_unfall_nr = lv_unfall_nr ).

ENDMETHOD.


METHOD onactionsave.
  DATA lv_fehler TYPE abap_bool.
  DATA lv_ok     TYPE abap_bool.

  lv_fehler = wd_this->check_mandatory( ).
  IF lv_fehler = abap_true.
    RETURN.
  ENDIF.

  lv_ok = wd_comp_controller->save_unfall( ).
  IF lv_ok = abap_false.
*   Meldungen stehen bereits im Message Manager
    RETURN.
  ENDIF.

  wd_context->set_attribute( name = 'READ_ONLY' value = abap_true ).
  wd_this->fire_to_confirm_plg( ).

ENDMETHOD.


METHOD check_mandatory.
* Returning: RV_FEHLER TYPE ABAP_BOOL
  DATA lo_nd_unfall TYPE REF TO if_wd_context_node.
  DATA lo_el_unfall TYPE REF TO if_wd_context_element.
  DATA ls_unfall    TYPE wd_this->element_unfall.
  DATA lt_pflicht   TYPE string_table.
  DATA lv_feld      TYPE string.

  lo_nd_unfall = wd_context->get_child_node( name = wd_this->wdctx_unfall ).
  lo_el_unfall = lo_nd_unfall->get_element( ).
  lo_el_unfall->get_static_attributes( IMPORTING static_attributes = ls_unfall ).

  lt_pflicht = VALUE #( ( `PERNR` ) ( `WERKS` ) ( `UNFDAT` ) ( `UNFZEIT` )
                        ( `UNFORT` ) ( `HERGANG` ) ( `VERLETZUNG` ) ).
* ( `KOSTL` ) raus, Leiharbeitnehmer haben keine Kostenstelle - 2016

  LOOP AT lt_pflicht INTO lv_feld.
    ASSIGN COMPONENT lv_feld OF STRUCTURE ls_unfall TO FIELD-SYMBOL(<lv_wert>).
    CHECK sy-subrc = 0.
    IF <lv_wert> IS INITIAL.
      wd_this->mo_msg_mgr->report_attribute_error_message(
        message_text   = |Pflichtfeld { lv_feld } ist nicht gefüllt|
        element        = lo_el_unfall
        attribute_name = lv_feld ).
      rv_fehler = abap_true.
    ENDIF.
  ENDLOOP.

* Plausi Unfalldatum <= Tagesdatum: im Context-Attribut per Domäne? -> nein, offen (Ticket 4711)

ENDMETHOD.
