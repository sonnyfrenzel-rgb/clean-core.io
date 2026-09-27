CLASS zcl_ehs_unfall_handler DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Reaktion auf erfasste Unfälle: Workflow-Ereignis, Mail an SiFa
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    METHODS on_gemeldet
      FOR EVENT gemeldet OF zcl_ehs_unfall
      IMPORTING
        ev_unfallnr
        ev_meldepflichtig.
ENDCLASS.


CLASS zcl_ehs_unfall_handler IMPLEMENTATION.

  METHOD on_gemeldet.
    DATA: lv_objkey TYPE swr_struct-object_key,
          lv_event  TYPE swr_struct-event.

    lv_objkey = ev_unfallnr.
    lv_event  = COND #( WHEN ev_meldepflichtig = abap_true
                        THEN 'MELDEPFLICHTIG'
                        ELSE 'ERFASST' ).
    CALL FUNCTION 'SAP_WAPI_CREATE_EVENT'
      EXPORTING
        object_type = 'ZEHSUNF'
        object_key  = lv_objkey
        event       = lv_event
        commit_work = space.

    IF ev_meldepflichtig = abap_true.
*     Sicherheitsfachkraft sofort informieren (Verteiler ZEHS_SIFA)
      TRY.
          DATA(lo_send) = cl_bcs=>create_persistent( ).
          lo_send->set_document( cl_document_bcs=>create_document(
                                   i_type    = 'RAW'
                                   i_subject = |Meldepflichtiger Unfall { ev_unfallnr }|
                                   i_text    = VALUE #( ( line = 'Unfallanzeige an die BG binnen 3 Tagen.' ) ) ) ).
          lo_send->add_recipient( cl_distributionlist_bcs=>getu_persistent(
                                    i_dliname = 'ZEHS_SIFA'
                                    i_private = space ) ).
          lo_send->send( ).
        CATCH cx_bcs.
*         Mail ist nicht kritisch - Workflow läuft trotzdem
      ENDTRY.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
