CLASS zcl_ztm_a_fo_release DEFINITION
  PUBLIC
  INHERITING FROM /bobf/cl_lib_a_supercl_simple
  FINAL
  CREATE PUBLIC .

*"* Aktion ZZ_RELEASE_FO am Knoten ROOT des BO /SCMTMS/TOR
*"* Freigabe des Frachtauftrags durch die Disposition
*"* (Fiori-App "Frachtauftraege freigeben", Service ZTM_FO_SRV)
  PUBLIC SECTION.

    METHODS /bobf/if_frw_action~execute
        REDEFINITION .
  PROTECTED SECTION.
  PRIVATE SECTION.

    CONSTANTS:
      gc_status_released TYPE zztm_rel_status VALUE 'R' ##NO_TEXT,
      gc_cd_object       TYPE cdobjectcl      VALUE 'ZTM_FO' ##NO_TEXT.

    METHODS write_change_document
      IMPORTING
        !is_old TYPE /scmtms/s_tor_root_k
        !is_new TYPE /scmtms/s_tor_root_k .
    METHODS notify_dispatcher
      IMPORTING
        !is_root TYPE /scmtms/s_tor_root_k .
    METHODS send_to_carrier_portal
      IMPORTING
        !is_root TYPE /scmtms/s_tor_root_k .
ENDCLASS.



CLASS zcl_ztm_a_fo_release IMPLEMENTATION.


  METHOD /bobf/if_frw_action~execute.
*----------------------------------------------------------------------*
* Freigabe: Status ZZ_RELEASE_STATUS = 'R', Freigeber und Zeitpunkt,
* Aenderungsbeleg (Objektklasse ZTM_FO), Info-Mail an den Disponenten
*----------------------------------------------------------------------*
* 05/2021 PW  Erstellung
* 01/2022 SB  Aenderungsbeleg
* 06/2023 SB  Portal-Uebertragung deaktiviert (Projekt CarrierConnect gestoppt)
*----------------------------------------------------------------------*
    DATA: lt_root TYPE /scmtms/t_tor_root_k,
          ls_msg  TYPE symsg.

    CLEAR: et_failed_key, ev_static_action_failed.
    eo_message = /bobf/cl_frw_factory=>get_message( ).

*   Freigabeberechtigung der Disposition
    AUTHORITY-CHECK OBJECT 'Z_TM_FOREL'
      ID 'ACTVT' FIELD '43'.
    IF sy-subrc <> 0.
      ls_msg = VALUE #( msgty = 'E' msgid = 'ZTM' msgno = '110' ).
      eo_message->add_message( is_msg = ls_msg ).
      ev_static_action_failed = abap_true.
      et_failed_key = it_key.
      RETURN.
    ENDIF.

    io_read->retrieve(
      EXPORTING
        iv_node = /scmtms/if_tor_c=>sc_node-root
        it_key  = it_key
      IMPORTING
        et_data = lt_root ).

    LOOP AT lt_root REFERENCE INTO DATA(lr_root).

*     bereits freigegeben -> nur Hinweis, kein Fehler
      IF lr_root->zz_release_status = gc_status_released.
        ls_msg = VALUE #( msgty = 'W' msgid = 'ZTM' msgno = '111' msgv1 = lr_root->tor_id ).
        eo_message->add_message( is_msg  = ls_msg
                                 iv_node = is_ctx-node_key
                                 iv_key  = lr_root->key ).
        CONTINUE.
      ENDIF.

*     ohne Frachtfuehrer keine Freigabe
      IF lr_root->tspid IS INITIAL.
        ls_msg = VALUE #( msgty = 'E' msgid = 'ZTM' msgno = '112' msgv1 = lr_root->tor_id ).
        eo_message->add_message( is_msg  = ls_msg
                                 iv_node = is_ctx-node_key
                                 iv_key  = lr_root->key ).
        INSERT VALUE #( key = lr_root->key ) INTO TABLE et_failed_key.
        CONTINUE.
      ENDIF.

*     Gefahrgut: Kapazitaets-/ADR-Pruefung macht die Validierung beim Sichern
*      IF lr_root->zz_dg_indicator = abap_true.
*        ls_msg = VALUE #( msgty = 'E' msgid = 'ZTM' msgno = '113' ).
*        ...
*      ENDIF.

      DATA(ls_old) = lr_root->*.
      lr_root->zz_release_status = gc_status_released.
      lr_root->zz_released_by    = sy-uname.
      GET TIME STAMP FIELD lr_root->zz_released_at.

      io_modify->update(
        iv_node           = /scmtms/if_tor_c=>sc_node-root
        iv_key            = lr_root->key
        is_data           = lr_root
        it_changed_fields = VALUE #(
          ( zif_ztm_tor_c=>sc_node_attribute-root-zz_release_status )
          ( zif_ztm_tor_c=>sc_node_attribute-root-zz_released_by )
          ( zif_ztm_tor_c=>sc_node_attribute-root-zz_released_at ) ) ).

      write_change_document( is_old = ls_old
                             is_new = lr_root->* ).

      IF lr_root->zz_dispatcher IS NOT INITIAL.
        notify_dispatcher( lr_root->* ).
      ENDIF.

*     Uebertragung an das Frachtfuehrerportal - Projekt gestoppt 06/2023
*      send_to_carrier_portal( lr_root->* ).

    ENDLOOP.

  ENDMETHOD.


  METHOD write_change_document.
*   Aenderungsbeleg zur Freigabe (Objektklasse ZTM_FO, Struktur ZZTM_S_FO_REL_CD)
    DATA: lv_objectid TYPE cdhdr-objectid,
          ls_cd_old   TYPE zztm_s_fo_rel_cd,
          ls_cd_new   TYPE zztm_s_fo_rel_cd.

    lv_objectid = is_new-tor_id.
    ls_cd_old   = CORRESPONDING #( is_old ).
    ls_cd_new   = CORRESPONDING #( is_new ).

    CALL FUNCTION 'CHANGEDOCUMENT_OPEN'
      EXPORTING
        objectclass      = gc_cd_object
        objectid         = lv_objectid
      EXCEPTIONS
        sequence_invalid = 1
        OTHERS           = 2.

    CALL FUNCTION 'CHANGEDOCUMENT_SINGLE_CASE'
      EXPORTING
        change_indicator       = 'U'
        tablename              = 'ZZTM_S_FO_REL_CD'
        workarea_old           = ls_cd_old
        workarea_new           = ls_cd_new
      EXCEPTIONS
        nametab_error          = 1
        open_missing           = 2
        position_insert_failed = 3
        OTHERS                 = 4.

    CALL FUNCTION 'CHANGEDOCUMENT_CLOSE'
      EXPORTING
        objectclass             = gc_cd_object
        objectid                = lv_objectid
        date_of_change          = sy-datum
        time_of_change          = sy-uzeit
        tcode                   = sy-tcode
        username                = sy-uname
        object_change_indicator = 'U'
      EXCEPTIONS
        header_insert_failed    = 1
        no_position_inserted    = 2
        object_invalid          = 3
        open_missing            = 4
        position_insert_failed  = 5
        OTHERS                  = 6.
*   sy-subrc wird bewusst nicht ausgewertet - Beleg ist "nice to have" (SB)

  ENDMETHOD.


  METHOD notify_dispatcher.
*   Info-Mail an den verantwortlichen Disponenten (SAP-Benutzer)
    TRY.
        DATA(lo_send) = cl_bcs=>create_persistent( ).

        DATA(lt_text) = VALUE bcsy_text(
          ( line = |Frachtauftrag { is_root-tor_id ALPHA = OUT } wurde freigegeben.| )
          ( line = |Frachtfuehrer: { is_root-tspid ALPHA = OUT }, Fahrzeugtyp: { is_root-mtr }| )
          ( line = |Gesamtgewicht: { is_root-zz_total_weight } { is_root-zz_total_weight_uom }| )
          ( line = COND #( WHEN is_root-zz_dg_indicator = abap_true
                           THEN 'ACHTUNG: Gefahrgut geladen'
                           ELSE space ) ) ).

        DATA(lo_doc) = cl_document_bcs=>create_document(
                         i_type    = 'RAW'
                         i_text    = lt_text
                         i_subject = CONV so_obj_des( |Frachtauftrag { is_root-tor_id ALPHA = OUT } freigegeben| ) ).
        lo_send->set_document( lo_doc ).

        lo_send->add_recipient( cl_sapuser_bcs=>create( is_root-zz_dispatcher ) ).
        lo_send->set_send_immediately( abap_true ).

        lo_send->send( ).
*       kein COMMIT WORK - die Sendung wird mit dem Sichern des Frachtauftrags festgeschrieben

      CATCH cx_bcs ##NO_HANDLER.
*       Mailfehler duerfen die Freigabe nicht verhindern
    ENDTRY.

  ENDMETHOD.


  METHOD send_to_carrier_portal.
*   Uebergabe an das Frachtfuehrerportal per RFC (Projekt CarrierConnect)
    CALL FUNCTION 'Z_CC_FO_TRANSMIT'
      DESTINATION 'CARRIER_PORTAL'
      EXPORTING
        iv_tor_id             = is_root-tor_id
        iv_tspid              = is_root-tspid
      EXCEPTIONS
        communication_failure = 1
        system_failure        = 2
        OTHERS                = 3.
    IF sy-subrc <> 0.
      MESSAGE e120(ztm) WITH is_root-tor_id INTO DATA(lv_dummy) ##NEEDED.
    ENDIF.

  ENDMETHOD.
ENDCLASS.
