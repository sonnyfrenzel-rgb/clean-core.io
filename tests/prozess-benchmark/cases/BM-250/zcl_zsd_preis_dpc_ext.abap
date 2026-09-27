CLASS zcl_zsd_preis_dpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zsd_preis_dpc
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~changeset_begin   REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~changeset_process REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~changeset_end     REDEFINITION.
  PRIVATE SECTION.
    DATA mo_collector TYPE REF TO zcl_sd_msg_collector.
ENDCLASS.



CLASS zcl_zsd_preis_dpc_ext IMPLEMENTATION.

  METHOD /iwbep/if_mgw_appl_srv_runtime~changeset_begin.
*   Nur Preisfreigaben (PATCH/PUT auf PreisPosSet) im Changeset erlaubt,
*   dann Deferred Mode: alle Operationen in einem CHANGESET_PROCESS
    LOOP AT it_operation_info INTO DATA(ls_op).
      IF ls_op-entity_set <> 'PreisPosSet' OR ls_op-operation_type <> 'UE'.
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_tech_exception
          EXPORTING
            textid = /iwbep/cx_mgw_tech_exception=>changeset_not_supported.
      ENDIF.
    ENDLOOP.
    cv_defer_mode = abap_true.
    mo_collector  = NEW #( io_container = mo_context->get_message_container( ) ).
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~changeset_process.
    DATA: ls_pos     TYPE zcl_zsd_preis_mpc=>ts_preispos,
          lt_auftrag TYPE zcl_sd_preis_service=>tt_freigabe,
          lo_service TYPE REF TO zcl_sd_preis_service,
          lo_req     TYPE REF TO /iwbep/cl_mgw_request.

*   1. Alle Positionen einsammeln, nach Auftrag gruppiert
    LOOP AT it_changeset_request INTO DATA(ls_request).
      lo_req ?= ls_request-request_context.
      ls_request-entry_provider->read_entry_data( IMPORTING es_data = ls_pos ).

      IF ls_pos-neupreis <= 0.
        mo_collector->add_text( iv_type = 'E'
                                iv_text = |Position { ls_pos-vbeln }/{ ls_pos-posnr }: Preis muss positiv sein| ).
        mo_collector->raise_if_errors( ).
      ENDIF.

      APPEND VALUE #( vbeln    = ls_pos-vbeln
                      posnr    = ls_pos-posnr
                      neupreis = ls_pos-neupreis
                      waerk    = ls_pos-waerk
                      op_index = ls_request-operation_no ) TO lt_auftrag.
    ENDLOOP.

*   2. Je Auftrag freigeben (Sperre + BAPI im Service)
    lo_service = NEW #( io_collector = mo_collector ).
    lo_service->freigeben( CHANGING ct_freigabe = lt_auftrag ).

*   3. Antworten je Operation
    LOOP AT lt_auftrag INTO DATA(ls_frei).
      ls_pos = CORRESPONDING #( ls_frei ).
      ls_pos-status = 'F'.
      APPEND VALUE #( operation_no = ls_frei-op_index ) TO ct_changeset_response
        ASSIGNING FIELD-SYMBOL(<ls_resp>).
      copy_data_to_ref( EXPORTING is_data = ls_pos
                        CHANGING  cr_data = <ls_resp>-entity_data ).
    ENDLOOP.
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~changeset_end.
*   COMMIT WORK setzt das Gateway-Framework nach CHANGESET_END selbst ab.
*   Hier nur noch das Anwendungsprotokoll zum Sichern vormerken.
    mo_collector->save_log( ).
  ENDMETHOD.

ENDCLASS.
