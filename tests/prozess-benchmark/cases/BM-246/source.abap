  METHOD stoermeldungset_create_entity.
*----------------------------------------------------------------------*
* ZPM_STOERMELDUNG_SRV - Anlage einer Stoermeldung (M2) aus der
* Instandhaltungs-App am Tablet. Nachrichten gehen ueber den
* Message Container an die App (sap-message Header).
*----------------------------------------------------------------------*
    DATA: ls_input     TYPE zcl_zpm_stoermeldung_mpc=>ts_stoermeldung,
          ls_header    TYPE bapi2080_nothdri,
          ls_hdr_exp   TYPE bapi2080_nothdre,
          lt_return    TYPE bapiret2_t,
          lv_qmnum     TYPE qmnum,
          lv_qmnum_neu TYPE qmnum,
          ls_equi      TYPE equi,
          lo_msg       TYPE REF TO /iwbep/if_message_container.

    lo_msg = mo_context->get_message_container( ).

    io_data_provider->read_entry_data( IMPORTING es_data = ls_input ).

*   Pflichtfelder
    IF ls_input-equnr IS INITIAL OR ls_input-kurztext IS INITIAL.
      lo_msg->add_message( iv_msg_type   = 'E'
                           iv_msg_id     = 'ZPM_APP'
                           iv_msg_number = '001' ).
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING message_container = lo_msg.
    ENDIF.

*   Equipment muss existieren und darf nicht geloescht sein
    SELECT SINGLE * FROM equi INTO ls_equi
      WHERE equnr = ls_input-equnr.
    IF sy-subrc <> 0.
      lo_msg->add_message( iv_msg_type   = 'E'
                           iv_msg_id     = 'ZPM_APP'
                           iv_msg_number = '002'
                           iv_msg_v1     = CONV #( ls_input-equnr ) ).
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING message_container = lo_msg.
    ENDIF.

    ls_header-equipment  = ls_input-equnr.
    ls_header-short_text = ls_input-kurztext.
    ls_header-priority   = COND #( WHEN ls_input-anlage_steht = abap_true THEN '1' ELSE '3' ).
    ls_header-reportedby = sy-uname.
    ls_header-desstdate  = sy-datum.
    ls_header-desenddate = sy-datum + COND i( WHEN ls_input-anlage_steht = abap_true THEN 1 ELSE 14 ).

    CALL FUNCTION 'BAPI_ALM_NOTIF_CREATE'
      EXPORTING
        notif_type         = 'M2'
        notifheader        = ls_header
      IMPORTING
        notifheader_export = ls_hdr_exp
      TABLES
        return             = lt_return.

    IF line_exists( lt_return[ type = 'E' ] ) OR line_exists( lt_return[ type = 'A' ] ).
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      lo_msg->add_messages_from_bapi( it_bapi_messages         = lt_return
                                      iv_determine_leading_msg = /iwbep/if_message_container=>gcs_leading_msg_search_option-first ).
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING message_container = lo_msg.
    ENDIF.

    lv_qmnum = ls_hdr_exp-notif_no.     "temporaere Nummer %00000000001

    CALL FUNCTION 'BAPI_ALM_NOTIF_SAVE'
      EXPORTING
        number      = lv_qmnum
      IMPORTING
        notifheader = ls_hdr_exp
      TABLES
        return      = lt_return.
    lv_qmnum_neu = ls_hdr_exp-notif_no.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.

*   Erfolgsmeldung in den sap-message Header (nicht blockierend)
    lo_msg->add_message( iv_msg_type   = 'S'
                         iv_msg_id     = 'ZPM_APP'
                         iv_msg_number = '010'
                         iv_msg_v1     = CONV #( lv_qmnum_neu )
                         iv_add_to_response_header = abap_true ).

    er_entity = CORRESPONDING #( ls_input ).
    er_entity-qmnum     = lv_qmnum_neu.
    er_entity-prioritaet = ls_hdr_exp-priority.
  ENDMETHOD.
