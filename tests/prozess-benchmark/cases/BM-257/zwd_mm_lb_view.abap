*----------------------------------------------------------------------*
* WD-Komponente ZWD_MM_LIEF_BEWERTUNG, View V_BEWERTUNG
* Aktionsbehandler des View-Controllers
*----------------------------------------------------------------------*
METHOD wddomodifyview .
* Speichern-Button nur nach einer frischen Berechnung aktiv
  DATA lo_button TYPE REF TO cl_wd_button.

  lo_button ?= view->get_element( 'BTN_SPEICHERN' ).
  IF lo_button IS BOUND.
    lo_button->set_enabled( wd_comp_controller->mv_berechnet ).
  ENDIF.
ENDMETHOD.


METHOD onactionberechnen .
  DATA: lo_el_sel TYPE REF TO if_wd_context_element,
        ls_sel    TYPE wd_this->element_selektion,
        lo_msg    TYPE REF TO if_wd_message_manager.

  lo_msg    = wd_this->wd_get_api( )->get_message_manager( ).
  lo_el_sel = wd_context->get_child_node( name = wd_this->wdctx_selektion )->get_element( ).
  lo_el_sel->get_static_attributes( IMPORTING static_attributes = ls_sel ).

  IF ls_sel-lifnr IS INITIAL.
    lo_msg->report_attribute_error_message( message_text   = 'Lieferant eingeben'
                                            element        = lo_el_sel
                                            attribute_name = 'LIFNR' ).
    RETURN.
  ENDIF.

  IF ls_sel-bis < ls_sel-von OR ls_sel-von IS INITIAL.
    ls_sel-von = sy-datum - 365.      "Standard: letzte 12 Monate
    ls_sel-bis = sy-datum.
    lo_el_sel->set_static_attributes( static_attributes = ls_sel ).
  ENDIF.

  wd_comp_controller->berechnen( iv_lifnr = ls_sel-lifnr
                                 iv_von   = ls_sel-von
                                 iv_bis   = ls_sel-bis ).
ENDMETHOD.


METHOD onactionspeichern .
  DATA: lo_window_manager TYPE REF TO if_wd_window_manager,
        lo_popup          TYPE REF TO if_wd_window,
        lo_msg            TYPE REF TO if_wd_message_manager,
        lv_gesamt         TYPE zmm_lb_punkte.

  lo_msg = wd_this->wd_get_api( )->get_message_manager( ).

  IF wd_comp_controller->mv_berechnet = abap_false.
    lo_msg->report_warning( message_text = 'Bitte zuerst berechnen' ).
    RETURN.
  ENDIF.

  wd_context->get_child_node( name = wd_this->wdctx_ergebnis )->get_element( )->get_attribute(
    EXPORTING name = 'GESAMT' IMPORTING value = lv_gesamt ).

* Schlechte Bewertung loest Eskalation aus -> vorher bestaetigen lassen
  IF lv_gesamt < 60.
    lo_window_manager = wd_comp_controller->wd_get_api( )->get_window_manager( ).
    lo_popup = lo_window_manager->create_popup_to_confirm(
                 text         = VALUE #( ( |Bewertung { lv_gesamt } Punkte: Lieferant wird eskaliert. Speichern?| ) )
                 button_kind  = if_wd_window=>co_buttons_yesno
                 message_type = if_wd_window=>co_msg_type_warning
                 window_title = 'Eskalation bestaetigen' ).
    lo_popup->subscribe_to_button_event( button            = if_wd_window=>co_button_yes
                                         action_name       = 'SPEICHERN_BESTAETIGT'
                                         action_view       = wd_this->wd_get_api( )
                                         is_default_button = abap_false ).
    lo_popup->open( ).
    RETURN.
  ENDIF.

  wd_comp_controller->speichern( ).
ENDMETHOD.


METHOD onactionspeichern_bestaetigt .
  wd_comp_controller->speichern( ).
ENDMETHOD.


METHOD onactionhistorie_waehlen .
* Doppelklick auf eine Zeile der Historie: gespeicherte Bewertung anzeigen
  DATA: ls_hist TYPE wd_this->element_historie,
        lo_msg  TYPE REF TO if_wd_message_manager.

  lo_msg = wd_this->wd_get_api( )->get_message_manager( ).
  wd_context->get_child_node( name = wd_this->wdctx_historie )->get_lead_selection(
    )->get_static_attributes( IMPORTING static_attributes = ls_hist ).

  SELECT SINGLE * FROM zmm_lief_bew
    WHERE lifnr = @ls_hist-lifnr
      AND von   = @ls_hist-von
      AND bis   = @ls_hist-bis
    INTO @DATA(ls_bew).
  IF sy-subrc <> 0.
    lo_msg->report_t100_message( msgid = 'ZMM_LB' msgno = '002' msgty = 'E' p1 = ls_hist-lifnr ).
    RETURN.
  ENDIF.

  wd_context->get_child_node( name = wd_this->wdctx_ergebnis )->bind_structure( new_item = ls_bew ).
* gespeicherte Bewertung nicht erneut speichern lassen
  wd_comp_controller->mv_berechnet = abap_false.
ENDMETHOD.
