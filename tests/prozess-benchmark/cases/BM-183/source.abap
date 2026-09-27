CLASS zcl_tm_frachttarif IMPLEMENTATION.
* Frachtkostenkalkulation Spedition: Tarife liegen im Shared-Objects-
* Gebiet ZCL_TM_TARIF_AREA (Aufbau siehe ZCL_TM_TARIF_LOADER)
  METHOD get_frachtpreis.
    DATA: lo_area TYPE REF TO zcl_tm_tarif_area,
          ls_satz TYPE ztm_tarifsatz.

    TRY.
        lo_area = zcl_tm_tarif_area=>attach_for_read( ).
      CATCH cx_shm_no_active_version cx_shm_inconsistent.
        zcl_tm_tarif_loader=>build_area( ).
        lo_area = zcl_tm_tarif_area=>attach_for_read( ).
    ENDTRY.

    ls_satz = lo_area->root->get_satz( iv_route ).
    lo_area->detach( ).

    IF ls_satz IS INITIAL.
      RAISE EXCEPTION TYPE zcx_tm_tarif
        EXPORTING
          textid = zcx_tm_tarif=>kein_tarif
          route  = iv_route.
    ENDIF.

    rv_preis = COND #( WHEN iv_gewicht <= 1000 THEN ls_satz-grundpreis
                       ELSE ls_satz-grundpreis
                          + ( iv_gewicht - 1000 ) / 100 * ls_satz-satz_100kg ).
  ENDMETHOD.
ENDCLASS.
