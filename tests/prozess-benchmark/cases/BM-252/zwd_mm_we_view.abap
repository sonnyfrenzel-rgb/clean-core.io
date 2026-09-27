*----------------------------------------------------------------------*
* WD-Komponente ZWD_MM_WARENEINGANG, View V_ERFASSUNG
* Methoden des View-Controllers (Aktionsbehandler)
*----------------------------------------------------------------------*
METHOD onactionbestellung_laden .
  DATA: lo_el_kopf TYPE REF TO if_wd_context_element,
        lv_ebeln   TYPE ebeln.

  lo_el_kopf = wd_context->get_child_node( name = wd_this->wdctx_kopf )->get_element( ).
  lo_el_kopf->get_attribute( EXPORTING name = `EBELN` IMPORTING value = lv_ebeln ).

  IF lv_ebeln IS INITIAL.
    wd_this->wd_get_api( )->get_message_manager( )->report_attribute_error_message(
      message_text   = 'Bitte Bestellnummer eingeben'
      element        = lo_el_kopf
      attribute_name = `EBELN` ).
    RETURN.
  ENDIF.

  wd_comp_controller->lade_bestellung( lv_ebeln ).
ENDMETHOD.


METHOD onactionbuchen .
  DATA: lo_nd_pos  TYPE REF TO if_wd_context_node,
        lt_pos     TYPE wd_this->elements_positionen,
        lv_mblnr   TYPE mblnr,
        lo_msg     TYPE REF TO if_wd_message_manager.

  lo_msg    = wd_this->wd_get_api( )->get_message_manager( ).
  lo_nd_pos = wd_context->get_child_node( name = wd_this->wdctx_positionen ).
  lo_nd_pos->get_static_attributes_table( IMPORTING table = lt_pos ).

* nur Positionen mit erfasster Menge buchen
  DELETE lt_pos WHERE erfmenge <= 0.
  IF lt_pos IS INITIAL.
    lo_msg->report_warning( message_text = 'Keine Menge erfasst - nichts zu buchen' ).
    RETURN.
  ENDIF.

  lv_mblnr = wd_comp_controller->buchen( lt_pos ).

  IF lv_mblnr IS NOT INITIAL.
    lo_msg->report_success( message_text = |Materialbeleg { lv_mblnr } gebucht| ).
    wd_this->fire_to_bestaetigung_plg( iv_mblnr = lv_mblnr ).
  ENDIF.
ENDMETHOD.
