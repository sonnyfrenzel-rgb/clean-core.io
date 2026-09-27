CLASS zcl_zhr_zeit_dpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zhr_zeit_dpc
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* ZHR_ZEITGENEHMIGUNG_SRV - Genehmigung von CATS-Zeiten durch die
* Fuehrungskraft (eigene Fiori-App, ersetzt CATS_APPR_LITE)
*   GET  ZeitenSet                       offene Zeiten der Mitarbeiter
*   PUT  ZeitenSet(Counter)              Stundenkorrektur vor Genehmigung
*   POST /Genehmigen?Counter=..          Funktionsimport
*   POST /Ablehnen?Counter=..&Grund=..   Funktionsimport
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~execute_action REDEFINITION.
  PROTECTED SECTION.
    METHODS zeitenset_get_entityset REDEFINITION.
    METHODS zeitenset_update_entity REDEFINITION.
  PRIVATE SECTION.
    METHODS geschaeftsfehler
      IMPORTING ix_fehler TYPE REF TO cx_root
      RAISING   /iwbep/cx_mgw_busi_exception.
ENDCLASS.



CLASS zcl_zhr_zeit_dpc_ext IMPLEMENTATION.

  METHOD zeitenset_get_entityset.
    DATA: lo_service TYPE REF TO zcl_hr_zeit_service,
          lt_r_datum TYPE RANGE OF catsdate.

    lo_service = NEW #( ).
    DATA(lt_r_pernr) = lo_service->untergebene( sy-uname ).
    IF lt_r_pernr IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid  = /iwbep/cx_mgw_busi_exception=>business_error
          message = 'Ihnen sind keine Mitarbeiter zugeordnet'.
    ENDIF.

    READ TABLE it_filter_select_options INTO DATA(ls_filter)
         WITH KEY property = 'Workdate'.
    IF sy-subrc = 0.
      lt_r_datum = CORRESPONDING #( ls_filter-select_options ).
    ENDIF.

*   Status 20 = freigegeben, wartet auf Genehmigung
    SELECT counter, pernr, workdate, catshours, awart, rnplnr, vornr, ltxa1
      FROM catsdb
      WHERE pernr    IN @lt_r_pernr
        AND workdate IN @lt_r_datum
        AND status   = '20'
      ORDER BY pernr, workdate
      INTO CORRESPONDING FIELDS OF TABLE @et_entityset.

    es_response_context-inlinecount = lines( et_entityset ).
    /iwbep/cl_mgw_data_util=>paging( EXPORTING is_paging = is_paging
                                     CHANGING  ct_data   = et_entityset ).
  ENDMETHOD.


  METHOD zeitenset_update_entity.
    DATA ls_zeit TYPE zcl_zhr_zeit_mpc=>ts_zeiten.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_zeit ).

    TRY.
        NEW zcl_hr_zeit_service( )->stunden_korrigieren( iv_counter = ls_zeit-counter
                                                          iv_stunden = ls_zeit-catshours ).
      CATCH zcx_hr_zeit INTO DATA(lx_zeit).
        geschaeftsfehler( lx_zeit ).
    ENDTRY.

    er_entity = ls_zeit.
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~execute_action.
    DATA: lt_counter TYPE zcl_hr_zeit_service=>tt_counter,
          lv_status  TYPE catsstatus,
          lv_grund   TYPE string,
          ls_erg     TYPE zcl_zhr_zeit_mpc=>ts_ergebnis.

    SPLIT VALUE string( it_parameter[ name = 'Counter' ]-value OPTIONAL ) AT ',' INTO TABLE lt_counter.
    lv_grund = VALUE #( it_parameter[ name = 'Grund' ]-value OPTIONAL ).

    CASE iv_action_name.
      WHEN 'Genehmigen'.
        lv_status = '30'.
      WHEN 'Ablehnen'.
        IF lv_grund IS INITIAL.
          RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
            EXPORTING
              textid  = /iwbep/cx_mgw_busi_exception=>business_error
              message = 'Ablehnung nur mit Begruendung'.
        ENDIF.
        lv_status = '40'.
      WHEN OTHERS.
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_tech_exception
          EXPORTING
            textid = /iwbep/cx_mgw_tech_exception=>action_not_supported.
    ENDCASE.

    TRY.
        ls_erg-anzahl = NEW zcl_hr_zeit_service( )->status_setzen( it_counter = lt_counter
                                                                   iv_status  = lv_status
                                                                   iv_grund   = lv_grund ).
      CATCH zcx_hr_zeit INTO DATA(lx_zeit).
        geschaeftsfehler( lx_zeit ).
    ENDTRY.

    copy_data_to_ref( EXPORTING is_data = ls_erg
                      CHANGING  cr_data = er_data ).
  ENDMETHOD.


  METHOD geschaeftsfehler.
    DATA(lo_msg) = mo_context->get_message_container( ).
    lo_msg->add_message_text_only( iv_msg_type = 'E'
                                   iv_msg_text = CONV #( ix_fehler->get_text( ) ) ).
    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
      EXPORTING
        message_container = lo_msg.
  ENDMETHOD.

ENDCLASS.
