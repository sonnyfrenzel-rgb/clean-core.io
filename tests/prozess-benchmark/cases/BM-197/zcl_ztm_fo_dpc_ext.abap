CLASS zcl_ztm_fo_dpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_ztm_fo_dpc
  CREATE PUBLIC .

*"* Datenprovider-Erweiterung Service ZTM_FO_SRV
*"* (Fiori-App "Frachtauftraege freigeben" der Disposition)
  PUBLIC SECTION.

    METHODS /iwbep/if_mgw_appl_srv_runtime~execute_action
        REDEFINITION .
  PROTECTED SECTION.

    METHODS freightorderset_get_entityset
        REDEFINITION .
  PRIVATE SECTION.

    METHODS raise_bopf_messages
      IMPORTING
        !io_message TYPE REF TO /bobf/if_frw_message
      RAISING
        /iwbep/cx_mgw_busi_exception .
ENDCLASS.



CLASS zcl_ztm_fo_dpc_ext IMPLEMENTATION.


  METHOD /iwbep/if_mgw_appl_srv_runtime~execute_action.
*----------------------------------------------------------------------*
* Function Import ReleaseFreightOrder (POST, Parameter FreightOrderId)
*----------------------------------------------------------------------*
    DATA: lv_tor_id   TYPE /scmtms/tor_id,
          lt_key      TYPE /bobf/t_frw_key,
          lt_failed   TYPE /bobf/t_frw_key,
          lt_root     TYPE /scmtms/t_tor_root_k,
          lo_message  TYPE REF TO /bobf/if_frw_message,
          lv_rejected TYPE abap_bool,
          ls_result   TYPE zcl_ztm_fo_mpc=>ts_freightorder.

    IF iv_action_name <> 'ReleaseFreightOrder'.
      super->/iwbep/if_mgw_appl_srv_runtime~execute_action(
        EXPORTING
          iv_action_name          = iv_action_name
          it_parameter            = it_parameter
          io_tech_request_context = io_tech_request_context
        IMPORTING
          er_data                 = er_data ).
      RETURN.
    ENDIF.

    READ TABLE it_parameter INTO DATA(ls_param)
         WITH KEY name = 'FreightOrderId'.
    IF sy-subrc <> 0 OR ls_param-value IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid  = /iwbep/cx_mgw_busi_exception=>business_error
          message = 'Parameter FreightOrderId fehlt'.
    ENDIF.
    lv_tor_id = |{ ls_param-value ALPHA = IN }|.

    DATA(lo_srv_mgr) = /bobf/cl_tra_serv_mgr_factory=>get_service_manager(
                         /scmtms/if_tor_c=>sc_bo_key ).
    DATA(lo_tra_mgr) = /bobf/cl_tra_trans_mgr_factory=>get_transaction_manager( ).

*   Frachtauftragsnummer -> BOPF-Schluessel (alternativer Schluessel TOR_ID)
    lo_srv_mgr->convert_altern_key(
      EXPORTING
        iv_node_key   = /scmtms/if_tor_c=>sc_node-root
        iv_altkey_key = /scmtms/if_tor_c=>sc_alternative_key-root-tor_id
        it_key        = VALUE /scmtms/t_tor_id( ( lv_tor_id ) )
      IMPORTING
        et_key        = lt_key ).
    IF lt_key IS INITIAL OR lt_key[ 1 ]-key IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid      = /iwbep/cx_mgw_busi_exception=>resource_not_found
          entity_type = 'FreightOrder'.
    ENDIF.

*   Aktion ZZ_RELEASE_FO (Implementierung laut Erweiterung: ZCL_ZTM_A_FO_RELEASE)
    lo_srv_mgr->do_action(
      EXPORTING
        iv_act_key    = zif_ztm_tor_c=>sc_action-root-zz_release_fo
        it_key        = lt_key
      IMPORTING
        eo_message    = lo_message
        et_failed_key = lt_failed ).
    IF lt_failed IS NOT INITIAL.
      lo_tra_mgr->cleanup( ).
      raise_bopf_messages( lo_message ).
    ENDIF.

*   Sichern - hier laufen Determinationen und Konsistenzvalidierungen
    lo_tra_mgr->save(
      IMPORTING
        ev_rejected = lv_rejected
        eo_message  = lo_message ).
    IF lv_rejected = abap_true.
      raise_bopf_messages( lo_message ).
    ENDIF.

*   Antwort: Stand des Frachtauftrags nach dem Sichern
    lo_srv_mgr->retrieve(
      EXPORTING
        iv_node_key = /scmtms/if_tor_c=>sc_node-root
        it_key      = lt_key
      IMPORTING
        et_data     = lt_root ).

    DATA(ls_root) = VALUE #( lt_root[ 1 ] OPTIONAL ).
    ls_result = VALUE #( freightorderid = ls_root-tor_id
                         carrier        = ls_root-tspid
                         vehicletype    = ls_root-mtr
                         grossweight    = ls_root-zz_total_weight
                         weightunit     = ls_root-zz_total_weight_uom
                         dangerousgoods = ls_root-zz_dg_indicator
                         releasestatus  = ls_root-zz_release_status
                         releasedby     = ls_root-zz_released_by ).

    copy_data_to_ref(
      EXPORTING
        is_data = ls_result
      CHANGING
        cr_data = er_data ).

  ENDMETHOD.


  METHOD freightorderset_get_entityset.
*----------------------------------------------------------------------*
* FreightOrderSet: Arbeitsvorrat der Fiori-App (GET mit $filter)
*----------------------------------------------------------------------*
    DATA: lt_sel  TYPE /bobf/t_frw_query_selparam,
          lt_key  TYPE /bobf/t_frw_key,
          lt_root TYPE /scmtms/t_tor_root_k.

*   immer nur Frachtauftraege
    lt_sel = VALUE #( ( attribute_name = 'TOR_CAT' sign = 'I' option = 'EQ' low = 'TO' ) ).

*   $filter der App in BOPF-Selektionsparameter uebersetzen
    LOOP AT it_filter_select_options INTO DATA(ls_filter).
      DATA(lv_attr) = SWITCH string( ls_filter-property
                        WHEN 'FreightOrderId' THEN `TOR_ID`
                        WHEN 'Carrier'        THEN `TSPID`
                        WHEN 'ReleaseStatus'  THEN `ZZ_RELEASE_STATUS`
                        ELSE `` ).
      IF lv_attr IS INITIAL.
        CONTINUE.          "unbekannte Filter werden stillschweigend ignoriert
      ENDIF.
      lt_sel = VALUE #( BASE lt_sel
                        FOR ls_so IN ls_filter-select_options
                        ( attribute_name = lv_attr
                          sign           = ls_so-sign
                          option         = ls_so-option
                          low            = ls_so-low
                          high           = ls_so-high ) ).
    ENDLOOP.

    DATA(lo_srv_mgr) = /bobf/cl_tra_serv_mgr_factory=>get_service_manager(
                         /scmtms/if_tor_c=>sc_bo_key ).

    lo_srv_mgr->query(
      EXPORTING
        iv_query_key            = /scmtms/if_tor_c=>sc_query-root-qdb_query_by_attributes
        it_selection_parameters = lt_sel
      IMPORTING
        et_key                  = lt_key ).
    IF lt_key IS INITIAL.
      RETURN.
    ENDIF.

    lo_srv_mgr->retrieve(
      EXPORTING
        iv_node_key = /scmtms/if_tor_c=>sc_node-root
        it_key      = lt_key
      IMPORTING
        et_data     = lt_root ).

    et_entityset = VALUE #( FOR ls_root IN lt_root
                            ( freightorderid = ls_root-tor_id
                              carrier        = ls_root-tspid
                              vehicletype    = ls_root-mtr
                              grossweight    = ls_root-zz_total_weight
                              weightunit     = ls_root-zz_total_weight_uom
                              dangerousgoods = ls_root-zz_dg_indicator
                              releasestatus  = ls_root-zz_release_status
                              releasedby     = ls_root-zz_released_by ) ).

    es_response_context-inlinecount = lines( et_entityset ).

*   Paging erst nach dem Lesen (Query kann kein $skip, Ticket TM-233)
    /iwbep/cl_mgw_data_util=>paging(
      EXPORTING
        is_paging = is_paging
      CHANGING
        ct_data   = et_entityset ).

  ENDMETHOD.


  METHOD raise_bopf_messages.
*   BOPF-Meldungen in den Gateway-Meldungscontainer uebernehmen und abbrechen
    DATA lt_msg TYPE /bobf/t_frw_message_k.

    io_message->get_messages( IMPORTING et_message = lt_msg ).

    DATA(lo_container) = mo_context->get_message_container( ).
    LOOP AT lt_msg INTO DATA(ls_msg).
      lo_container->add_message_text_only(
        iv_msg_type = ls_msg-severity
        iv_msg_text = CONV #( ls_msg-message->get_text( ) ) ).
    ENDLOOP.

    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
      EXPORTING
        message_container = lo_container.

  ENDMETHOD.
ENDCLASS.
