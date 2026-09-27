CLASS zcl_zsd_auftrag_dpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zsd_auftrag_dpc
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~create_deep_entity REDEFINITION.

  PRIVATE SECTION.
    CONSTANTS: gc_lifsk_kredit TYPE lifsk VALUE 'Z1',
               gc_kkber        TYPE kkber VALUE '1000'.

    METHODS abbrechen
      IMPORTING iv_text TYPE string OPTIONAL
                ix_prev TYPE REF TO cx_root OPTIONAL
      RAISING   /iwbep/cx_mgw_busi_exception.
ENDCLASS.



CLASS zcl_zsd_auftrag_dpc_ext IMPLEMENTATION.

  METHOD /iwbep/if_mgw_appl_srv_runtime~create_deep_entity.
*----------------------------------------------------------------------*
* ZSD_AUFTRAG_SRV - Deep Insert Auftrag + Positionen aus dem B2B-Webshop
* POST /AuftragSet mit $expand-Struktur ToItems
* 2021-06 AK Erstellung, 2022-02 AK Kreditpruefung, 2023-09 LM Eilauftrag
*----------------------------------------------------------------------*
    DATA: ls_deep     TYPE zcl_zsd_auftrag_mpc_ext=>ts_deep_auftrag,
          ls_kopf     TYPE bapisdhd1,
          lt_item     TYPE zcl_sd_auftrag_mapper=>tt_item,
          lt_itemx    TYPE zcl_sd_auftrag_mapper=>tt_itemx,
          lt_schedule TYPE zcl_sd_auftrag_mapper=>tt_schedule,
          lt_partner  TYPE zcl_sd_auftrag_mapper=>tt_partner,
          lt_return   TYPE STANDARD TABLE OF bapiret2,
          lv_vbeln    TYPE vbeln_va,
          lv_wert     TYPE netwr_ak,
          lo_pruef    TYPE REF TO zcl_sd_auftrag_pruefung,
          lo_mapper   TYPE REF TO zcl_sd_auftrag_mapper,
          lo_msg      TYPE REF TO /iwbep/if_message_container.

    lo_msg = mo_context->get_message_container( ).

    io_data_provider->read_entry_data( IMPORTING es_data = ls_deep ).

    IF ls_deep-toitems IS INITIAL.
      abbrechen( iv_text = 'Auftrag ohne Positionen' ).
    ENDIF.

    AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
      ID 'VKORG' FIELD ls_deep-vkorg
      ID 'VTWEG' FIELD ls_deep-vtweg
      ID 'SPART' FIELD ls_deep-spart
      ID 'ACTVT' FIELD '01'.
    IF sy-subrc <> 0.
      abbrechen( iv_text = |Keine Berechtigung fuer Verkaufsorganisation { ls_deep-vkorg }| ).
    ENDIF.

*   --- Stammdatenpruefungen -------------------------------------------
    lo_pruef = NEW #( ).
    TRY.
        lo_pruef->pruefe_kunde( iv_kunnr = ls_deep-kunnr
                                iv_vkorg = ls_deep-vkorg
                                iv_vtweg = ls_deep-vtweg
                                iv_spart = ls_deep-spart ).
        lo_pruef->pruefe_materialien( it_pos   = ls_deep-toitems
                                      iv_vkorg = ls_deep-vkorg
                                      iv_vtweg = ls_deep-vtweg ).

*       --- Mapping ----------------------------------------------------
        lo_mapper = NEW #( ).
        ls_kopf    = lo_mapper->map_kopf( ls_deep ).
        lo_mapper->map_positionen( EXPORTING is_deep     = ls_deep
                                   IMPORTING et_item     = lt_item
                                             et_itemx    = lt_itemx
                                             et_schedule = lt_schedule ).
        lt_partner = lo_mapper->map_partner( ls_deep ).

      CATCH zcx_sd_auftrag INTO DATA(lx_auftrag).
        abbrechen( ix_prev = lx_auftrag ).
    ENDTRY.

*   --- Kreditpruefung (Shoppreis als Naeherung fuer den Auftragswert) ---
    lv_wert = REDUCE #( INIT s = CONV netwr_ak( 0 )
                        FOR ls_p IN ls_deep-toitems
                        NEXT s = s + ls_p-menge * ls_p-shoppreis ).
    IF lo_pruef->kredit_ok( iv_kunnr = ls_deep-kunnr
                            iv_kkber = gc_kkber
                            iv_wert  = lv_wert ) = abap_false.
      ls_kopf-dlv_block = gc_lifsk_kredit.
      lo_msg->add_message( iv_msg_type   = 'W'
                           iv_msg_id     = 'ZSD_ORDER'
                           iv_msg_number = '040'
                           iv_msg_v1     = CONV #( ls_deep-kunnr )
                           iv_add_to_response_header = abap_true ).
    ENDIF.

*   --- Anlage ---------------------------------------------------------
    CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
      EXPORTING
        order_header_in     = ls_kopf
      IMPORTING
        salesdocument       = lv_vbeln
      TABLES
        return              = lt_return
        order_items_in      = lt_item
        order_items_inx     = lt_itemx
        order_partners      = lt_partner
        order_schedules_in  = lt_schedule.

    IF lv_vbeln IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      lo_msg->add_messages_from_bapi( it_bapi_messages = lt_return
                                      iv_determine_leading_msg =
                                        /iwbep/if_message_container=>gcs_leading_msg_search_option-first ).
      abbrechen( ).
    ENDIF.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.

*   Eilauftrag: Versandabteilung sofort informieren (eigene Session, nicht warten)
    IF ls_deep-eilig = abap_true.
      CALL FUNCTION 'ZSD_EIL_BENACHRICHTIGUNG'
        STARTING NEW TASK 'EIL'
        DESTINATION 'NONE'
        EXPORTING
          iv_vbeln = lv_vbeln.
    ENDIF.

*   --- Antwort: Auftrag mit Positionen und Nummern ---------------------
    ls_deep-vbeln = lv_vbeln.
    LOOP AT ls_deep-toitems ASSIGNING FIELD-SYMBOL(<ls_pos>).
      <ls_pos>-vbeln = lv_vbeln.
      <ls_pos>-posnr = sy-tabix * 10.
    ENDLOOP.

    copy_data_to_ref( EXPORTING is_data = ls_deep
                      CHANGING  cr_data = er_deep_entity ).
  ENDMETHOD.


  METHOD abbrechen.
    DATA(lo_msg) = mo_context->get_message_container( ).

    IF ix_prev IS BOUND.
      lo_msg->add_message_text_only( iv_msg_type = 'E'
                                     iv_msg_text = CONV #( ix_prev->get_text( ) ) ).
    ELSEIF iv_text IS NOT INITIAL.
      lo_msg->add_message_text_only( iv_msg_type = 'E'
                                     iv_msg_text = CONV #( iv_text ) ).
    ENDIF.

    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
      EXPORTING
        message_container = lo_msg
        previous          = ix_prev.
  ENDMETHOD.

ENDCLASS.
