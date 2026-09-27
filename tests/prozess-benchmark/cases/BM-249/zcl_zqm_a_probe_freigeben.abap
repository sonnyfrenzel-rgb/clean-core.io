CLASS zcl_zqm_a_probe_freigeben DEFINITION
  PUBLIC
  INHERITING FROM /bobf/cl_lib_a_supercl_simple
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS /bobf/if_frw_action~execute REDEFINITION.
  PRIVATE SECTION.
    METHODS melde
      IMPORTING
        iv_msgno TYPE symsgno
        iv_msgty TYPE symsgty
        iv_probe TYPE zqm_probe_nr
        iv_key   TYPE /bobf/conf_key
        iv_node  TYPE /bobf/obm_node_key
      CHANGING
        co_msg   TYPE REF TO /bobf/if_frw_message.
ENDCLASS.



CLASS zcl_zqm_a_probe_freigeben IMPLEMENTATION.

  METHOD /bobf/if_frw_action~execute.
*   Aktion FREIGEBEN auf Knoten ROOT
*   Status G (gemessen) -> F (freigegeben) oder R (zurueckgewiesen)
    DATA: lt_root     TYPE zqm_t_probe_root,
          lt_mw       TYPE zqm_t_probe_messwert,
          lt_link     TYPE /bobf/t_frw_key_link,
          lv_offen    TYPE i,
          lv_ausser   TYPE i,
          ls_hist     TYPE zqm_s_probe_historie.

    io_read->retrieve(
      EXPORTING iv_node = zif_zqm_probe_c=>sc_node-root
                it_key  = it_key
      IMPORTING et_data = lt_root ).

    io_read->retrieve_by_association(
      EXPORTING iv_node        = zif_zqm_probe_c=>sc_node-root
                it_key         = it_key
                iv_association = zif_zqm_probe_c=>sc_association-root-messwert
                iv_fill_data   = abap_true
      IMPORTING et_data        = lt_mw
                et_key_link    = lt_link ).

    LOOP AT lt_root REFERENCE INTO DATA(lr_root).

      IF lr_root->status <> 'G'.
        melde( EXPORTING iv_msgno = '030' iv_msgty = 'E' iv_probe = lr_root->probe_nr
                         iv_key = lr_root->key iv_node = is_ctx-node_key
               CHANGING  co_msg = eo_message ).
        INSERT VALUE #( key = lr_root->key ) INTO TABLE et_failed_key.
        CONTINUE.
      ENDIF.

      CLEAR: lv_offen, lv_ausser.
      LOOP AT lt_mw INTO DATA(ls_mw) WHERE parent_key = lr_root->key.
        IF ls_mw-istwert_erfasst = abap_false.
          lv_offen = lv_offen + 1.
        ELSEIF ls_mw-istwert < ls_mw-untergrenze OR ls_mw-istwert > ls_mw-obergrenze.
          lv_ausser = lv_ausser + 1.
        ENDIF.
      ENDLOOP.

      IF lv_offen > 0.
*       nicht alle Merkmale gemessen - Aktion fuer diese Probe ablehnen
        melde( EXPORTING iv_msgno = '031' iv_msgty = 'E' iv_probe = lr_root->probe_nr
                         iv_key = lr_root->key iv_node = is_ctx-node_key
               CHANGING  co_msg = eo_message ).
        INSERT VALUE #( key = lr_root->key ) INTO TABLE et_failed_key.
        CONTINUE.
      ENDIF.

      IF lv_ausser > 0.
        lr_root->status = 'R'.
        melde( EXPORTING iv_msgno = '032' iv_msgty = 'W' iv_probe = lr_root->probe_nr
                         iv_key = lr_root->key iv_node = is_ctx-node_key
               CHANGING  co_msg = eo_message ).
      ELSE.
        lr_root->status = 'F'.
      ENDIF.
      lr_root->freigabe_von = sy-uname.
      lr_root->freigabe_am  = sy-datum.

      io_modify->update(
        iv_node           = zif_zqm_probe_c=>sc_node-root
        iv_key            = lr_root->key
        is_data           = lr_root
        it_changed_fields = VALUE #( ( zif_zqm_probe_c=>sc_node_attribute-root-status )
                                     ( zif_zqm_probe_c=>sc_node_attribute-root-freigabe_von )
                                     ( zif_zqm_probe_c=>sc_node_attribute-root-freigabe_am ) ) ).

      ls_hist = VALUE #( status_neu = lr_root->status
                         anz_ausser = lv_ausser
                         benutzer   = sy-uname
                         datum      = sy-datum ).
      io_modify->create(
        iv_node            = zif_zqm_probe_c=>sc_node-historie
        is_data            = REF #( ls_hist )
        iv_assoc_key       = zif_zqm_probe_c=>sc_association-root-historie
        iv_source_node_key = zif_zqm_probe_c=>sc_node-root
        iv_source_key      = lr_root->key ).
    ENDLOOP.
  ENDMETHOD.


  METHOD melde.
    IF co_msg IS NOT BOUND.
      co_msg = /bobf/cl_frw_factory=>get_message( ).
    ENDIF.
    co_msg->add_message(
      is_msg  = VALUE #( msgid = 'ZQM_PROBE' msgno = iv_msgno msgty = iv_msgty msgv1 = iv_probe )
      iv_node = iv_node
      iv_key  = iv_key ).
  ENDMETHOD.

ENDCLASS.
