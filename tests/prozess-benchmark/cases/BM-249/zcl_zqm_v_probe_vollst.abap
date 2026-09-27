CLASS zcl_zqm_v_probe_vollst DEFINITION
  PUBLIC
  INHERITING FROM /bobf/cl_lib_v_supercl_simple
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS /bobf/if_frw_validation~execute REDEFINITION.
ENDCLASS.



CLASS zcl_zqm_v_probe_vollst IMPLEMENTATION.

  METHOD /bobf/if_frw_validation~execute.
*   Aktionsvalidierung vor FREIGEBEN: Probe braucht Pruefer und
*   Probenahmezeitpunkt, und der Pruefer darf nicht der Freigebende sein
*   (Vier-Augen-Prinzip, Audit 2019 Feststellung QM-07)
    DATA lt_root TYPE zqm_t_probe_root.

    io_read->retrieve(
      EXPORTING iv_node = zif_zqm_probe_c=>sc_node-root
                it_key  = it_key
      IMPORTING et_data = lt_root ).

    LOOP AT lt_root INTO DATA(ls_root).
      IF ls_root-pruefer IS INITIAL OR ls_root-probenahme_ts IS INITIAL.
        INSERT VALUE #( key = ls_root-key ) INTO TABLE et_failed_key.
        IF eo_message IS NOT BOUND.
          eo_message = /bobf/cl_frw_factory=>get_message( ).
        ENDIF.
        eo_message->add_message(
          is_msg  = VALUE #( msgid = 'ZQM_PROBE' msgno = '020' msgty = 'E' msgv1 = ls_root-probe_nr )
          iv_node = is_ctx-node_key
          iv_key  = ls_root-key ).
      ELSEIF ls_root-pruefer = sy-uname.
        INSERT VALUE #( key = ls_root-key ) INTO TABLE et_failed_key.
        IF eo_message IS NOT BOUND.
          eo_message = /bobf/cl_frw_factory=>get_message( ).
        ENDIF.
        eo_message->add_message(
          is_msg  = VALUE #( msgid = 'ZQM_PROBE' msgno = '021' msgty = 'E' msgv1 = ls_root-probe_nr )
          iv_node = is_ctx-node_key
          iv_key  = ls_root-key ).
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
