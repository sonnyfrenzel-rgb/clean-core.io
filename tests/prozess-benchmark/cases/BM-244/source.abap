METHOD onactionfreigeben .
*----------------------------------------------------------------------*
* View V_BANF_LISTE, Aktion FREIGEBEN (Button "Freigeben")
* Gibt die markierten Bestellanforderungen mit dem Freigabecode des
* angemeldeten Genehmigers frei. WD-Komponente ZWD_MM_BANF_FREIGABE
*----------------------------------------------------------------------*
  DATA: lo_nd_banf     TYPE REF TO if_wd_context_node,
        lt_elements    TYPE wdr_context_element_set,
        lo_el          TYPE REF TO if_wd_context_element,
        ls_banf        TYPE wd_this->element_banf,
        lo_msg_manager TYPE REF TO if_wd_message_manager,
        lt_return      TYPE STANDARD TABLE OF bapireturn,
        ls_return      TYPE bapireturn,
        lv_frgco       TYPE frgco,
        lv_status_neu  TYPE bapimmpara-rel_status,
        lv_ok          TYPE i,
        lv_fehler      TYPE i.

  lo_msg_manager = wd_comp_controller->wd_get_api( )->get_message_manager( ).
  lo_nd_banf     = wd_context->get_child_node( name = wd_this->wdctx_banf ).
  lt_elements    = lo_nd_banf->get_selected_elements( ).

  IF lt_elements IS INITIAL.
    lo_msg_manager->report_t100_message( msgid = 'ZMM_WD' msgno = '001' msgty = 'W' ).
    RETURN.
  ENDIF.

* Freigabecode des Benutzers aus Zuordnungstabelle
  SELECT SINGLE frgco FROM zmm_frg_user INTO lv_frgco
    WHERE bname = sy-uname
      AND aktiv = abap_true.
  IF sy-subrc <> 0.
    lo_msg_manager->report_t100_message( msgid = 'ZMM_WD' msgno = '002' msgty = 'E' ).
    RETURN.
  ENDIF.

  LOOP AT lt_elements INTO lo_el.
    lo_el->get_static_attributes( IMPORTING static_attributes = ls_banf ).

    CLEAR lt_return.
    CALL FUNCTION 'BAPI_REQUISITION_RELEASE_GEN'
      EXPORTING
        number                 = ls_banf-banfn
        rel_code               = lv_frgco
        no_commit_work         = abap_true
      IMPORTING
        rel_status_new         = lv_status_neu
      TABLES
        return                 = lt_return
      EXCEPTIONS
        authority_check_fail   = 1
        requisition_not_found  = 2
        enqueue_fail           = 3
        prerequisite_fail      = 4
        release_already_posted = 5
        responsibility_fail    = 6
        OTHERS                 = 7.
    IF sy-subrc <> 0.
      lv_fehler = lv_fehler + 1.
      lo_msg_manager->report_t100_message(
        msgid = 'ZMM_WD' msgno = '003' msgty = 'E'
        p1    = ls_banf-banfn
        p2    = sy-subrc ).
      CONTINUE.
    ENDIF.

    READ TABLE lt_return INTO ls_return WITH KEY type = 'E'.
    IF sy-subrc = 0.
      lv_fehler = lv_fehler + 1.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      lo_msg_manager->report_error_message( message_text = ls_return-message ).
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = abap_true.
      lv_ok = lv_ok + 1.
      ls_banf-frgzu = lv_status_neu.
      lo_el->set_static_attributes( static_attributes = ls_banf ).
    ENDIF.
  ENDLOOP.

  lo_msg_manager->report_t100_message(
    msgid = 'ZMM_WD' msgno = '010' msgty = 'S'
    p1    = lv_ok
    p2    = lv_fehler ).

ENDMETHOD.
